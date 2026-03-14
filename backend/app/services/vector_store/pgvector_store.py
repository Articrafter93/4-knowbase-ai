"""
pgvector store — insert and similarity search using SQLAlchemy + pgvector.
"""
import uuid
from typing import List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Chunk, DocumentStatus


async def upsert_chunks(db: AsyncSession, chunks: List[Chunk]) -> None:
    """Bulk insert or update chunks in the DB."""
    for chunk in chunks:
        db.add(chunk)
    await db.commit()


async def similarity_search(
    db: AsyncSession,
    query_embedding: List[float],
    owner_id: uuid.UUID,
    top_k: int = 20,
    collection_id: Optional[uuid.UUID] = None,
    document_id: Optional[uuid.UUID] = None,
) -> List[dict]:
    """
    Cosine similarity search over pgvector embeddings.
    Filters by owner (security trimming) + optional collection/document scope.
    Returns list of chunk dicts with score.
    """
    # Build filter conditions
    filter_clauses = ["c.owner_id = :owner_id", "c.embedding IS NOT NULL", "d.status = :active_status"]
    params: dict = {
        "owner_id": str(owner_id),
        "top_k": top_k,
        "embedding": query_embedding,
        "active_status": DocumentStatus.ACTIVE.value
    }

    if collection_id:
        filter_clauses.append("d.collection_id = :collection_id")
        params["collection_id"] = str(collection_id)
    if document_id:
        filter_clauses.append("c.document_id = :document_id")
        params["document_id"] = str(document_id)

    where = " AND ".join(filter_clauses)

    sql = text(f"""
        SELECT
            c.id,
            c.document_id,
            c.text,
            c.chunk_index,
            c.page_number,
            c.section_title,
            c.char_start,
            c.char_end,
            d.title AS doc_title,
            d.source_type,
            d.source_url,
            1 - (c.embedding <=> CAST(:embedding AS vector)) AS score
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE {where}
        ORDER BY c.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)
    rows = result.mappings().all()
    return [dict(r) for r in rows]
