"""
Document helpers shared by ingest, library and chat flows.
"""
from __future__ import annotations

import uuid
from typing import Iterable

from sqlalchemy import delete, inspect, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import NO_VALUE, set_committed_value

from app.models.document import Chunk, Document, Tag, document_tags


def normalize_tags(tags: Iterable[str] | None) -> list[str]:
    if not tags:
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in tags:
        tag = raw_tag.strip().lower()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
    return normalized


async def assign_tags_to_document(
    db: AsyncSession,
    document: Document,
    owner_id: uuid.UUID,
    tags: Iterable[str] | None,
) -> list[Tag]:
    normalized = normalize_tags(tags)
    await db.execute(delete(document_tags).where(document_tags.c.document_id == document.id))

    if not normalized:
        set_committed_value(document, "tags", [])
        return []

    result = await db.execute(
        select(Tag).where(
            Tag.owner_id == owner_id,
            Tag.name.in_(normalized),
        )
    )
    existing = {tag.name: tag for tag in result.scalars().all()}

    attached: list[Tag] = []
    for tag_name in normalized:
        tag = existing.get(tag_name)
        if tag is None:
            tag = Tag(owner_id=owner_id, name=tag_name)
            db.add(tag)
            await db.flush()
            existing[tag_name] = tag
        attached.append(tag)

    await db.execute(
        insert(document_tags),
        [{"document_id": document.id, "tag_id": tag.id} for tag in attached],
    )
    set_committed_value(document, "tags", attached)
    return attached


def serialize_document(document: Document) -> dict:
    tags_state = inspect(document).attrs.tags.loaded_value
    tags = [] if tags_state is NO_VALUE else [tag.name for tag in tags_state]

    return {
        "id": str(document.id),
        "title": document.title,
        "source_type": document.source_type,
        "source_url": document.source_url,
        "status": document.status,
        "is_favorite": document.is_favorite,
        "version": document.version,
        "parent_id": str(document.parent_id) if document.parent_id else None,
        "chunk_count": document.chunk_count,
        "word_count": document.word_count,
        "doc_metadata": document.doc_metadata,
        "collection_id": str(document.collection_id) if document.collection_id else None,
        "tags": tags,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "indexed_at": document.indexed_at,
    }


def serialize_chunk(chunk: Chunk, highlight: str | None = None) -> dict:
    highlighted_text = chunk.text
    if highlight:
        highlighted_text = chunk.text.replace(highlight, f"<<{highlight}>>", 1)

    return {
        "id": str(chunk.id),
        "document_id": str(chunk.document_id),
        "text": chunk.text,
        "highlighted_text": highlighted_text,
        "chunk_index": chunk.chunk_index,
        "page_number": chunk.page_number,
        "section_title": chunk.section_title,
        "char_start": chunk.char_start,
        "char_end": chunk.char_end,
        "token_count": chunk.token_count,
        "chunk_metadata": chunk.chunk_metadata,
    }
