"""
Ingestion pipeline — orchestrates parse → chunk → embed → store.
Called by the Celery worker.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Chunk, Document, DocumentStatus, IngestionJob
from app.services.embeddings.provider import embed_texts
from app.services.ingestion.audio import transcribe_audio
from app.services.ingestion.chunker import chunk_text
from app.services.ingestion.parsers import parse_file, parse_url

log = structlog.get_logger()


async def run_ingestion_pipeline(
    db: AsyncSession,
    document_id: uuid.UUID,
    job_id: uuid.UUID,
) -> None:
    """
    Full ingestion pipeline for a document:
    1. Parse source (file or URL)
    2. Chunk text semantically
    3. Generate embeddings
    4. Store chunks in DB (pgvector)
    5. Update document status
    """
    log.info("Starting ingestion", document_id=str(document_id))

    # Load document
    doc = await db.get(Document, document_id)
    job = await db.get(IngestionJob, job_id)
    if not doc or not job:
        log.error("Document or job not found", document_id=str(document_id))
        return

    try:
        # ── 1. Parse ──────────────────────────────────────────────────────────
        doc.status = DocumentStatus.PROCESSING
        job.status = "parsing"
        job.progress = 10
        await db.commit()

        source_type = doc.source_type.value if hasattr(doc.source_type, "value") else str(doc.source_type)
        existing_metadata = doc.doc_metadata or {}
        tag_names = existing_metadata.get("tags", [])

        if source_type == "url" and doc.source_url:
            text, metadata = await parse_url(doc.source_url)
        elif source_type == "note":
            metadata = existing_metadata
            text = (metadata.get("note_content") or "").strip()
            if not text:
                raise ValueError("Note documents require note_content in doc_metadata")
        elif source_type == "audio" and doc.file_path:
            audio_result = await transcribe_audio(doc.file_path)
            text = audio_result["text"]
            metadata = {
                **audio_result,
                "tags": tag_names,
            }
        elif doc.file_path:
            text, metadata = parse_file(doc.file_path, doc.mime_type)
        else:
            raise ValueError("Document has no source file or URL")

        # Update title from parsed metadata if not set
        if metadata.get("title") and doc.title in ("", "Untitled"):
            doc.title = metadata["title"][:500]
        doc.doc_metadata = {
            **existing_metadata,
            **metadata,
            "tags": tag_names,
        }

        # ── 2. Chunk ──────────────────────────────────────────────────────────
        job.status = "chunking"
        job.progress = 30
        await db.commit()

        raw_chunks = chunk_text(text)
        log.info("Chunked document", chunk_count=len(raw_chunks))

        # ── 3. Embed ──────────────────────────────────────────────────────────
        job.status = "embedding"
        job.progress = 50
        await db.commit()

        texts = [c.text for c in raw_chunks]
        embeddings = await embed_texts(texts)

        # ── 4. Store ──────────────────────────────────────────────────────────
        job.status = "storing"
        job.progress = 80
        await db.commit()

        chunk_objs = []
        for chunk_data, embedding in zip(raw_chunks, embeddings):
            chunk = Chunk(
                document_id=doc.id,
                owner_id=doc.owner_id,
                text=chunk_data.text,
                embedding=embedding,
                chunk_index=chunk_data.chunk_index,
                page_number=chunk_data.page_number,
                section_title=chunk_data.section_title,
                char_start=chunk_data.char_start,
                char_end=chunk_data.char_end,
                token_count=chunk_data.token_count,
            )
            chunk_objs.append(chunk)
            db.add(chunk)

        await db.flush()  # get chunk IDs before Qdrant upsert

        # ── Phase 2: Dual-write to Qdrant if backend includes it ─────────────
        if settings.RETRIEVAL_BACKEND in ("qdrant", "hybrid"):
            try:
                from app.services.vector_store.qdrant_store import upsert_chunk_to_qdrant
                for chunk, embedding in zip(chunk_objs, embeddings):
                    await upsert_chunk_to_qdrant(
                        chunk_id=str(chunk.id),
                        document_id=str(doc.id),
                        owner_id=str(doc.owner_id),
                        collection_id=str(doc.collection_id) if doc.collection_id else None,
                        status="active",
                        text=chunk.text,
                        dense_embedding=embedding,
                        metadata={
                            "doc_title": doc.title,
                            "source_type": source_type,
                            "page_number": chunk.page_number,
                            "section_title": chunk.section_title,
                            "source_url": doc.source_url,
                            "created_at": doc.created_at.isoformat(),
                            "tags": tag_names,
                        },
                    )
                log.info("Qdrant dual-write complete", chunks=len(chunk_objs))
            except Exception as exc:
                log.warning("Qdrant dual-write failed (pgvector OK)", error=str(exc))

        # ── 5. Finalize ───────────────────────────────────────────────────────
        doc.status = DocumentStatus.ACTIVE
        doc.chunk_count = len(chunk_objs)
        doc.word_count = sum(len(t.split()) for t in texts)
        doc.indexed_at = datetime.now(timezone.utc)
        job.status = "completed"
        job.progress = 100
        await db.commit()

        log.info("Ingestion complete", document_id=str(document_id), chunks=len(chunk_objs))

    except Exception as exc:
        log.exception("Ingestion failed", document_id=str(document_id), error=str(exc))
        doc.status = DocumentStatus.FAILED
        job.status = "failed"
        job.error_message = str(exc)
        await db.commit()
        raise
