"""
pgvector store — insert and similarity search using SQLAlchemy + pgvector.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import exists, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Chunk, Document, DocumentStatus, Tag, document_tags


async def upsert_chunks(db: AsyncSession, chunks: list[Chunk]) -> None:
    for chunk in chunks:
        db.add(chunk)
    await db.commit()


async def similarity_search(
    db: AsyncSession,
    query_embedding: list[float],
    user_id: uuid.UUID,
    accessible_collection_ids: Optional[list[uuid.UUID]] = None,
    top_k: int = 20,
    collection_id: Optional[uuid.UUID] = None,
    document_id: Optional[uuid.UUID] = None,
    tags: Optional[Iterable[str]] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    source_type: Optional[str] = None,
) -> list[dict]:
    normalized_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]
    accessible_collection_ids = accessible_collection_ids or []

    distance = Chunk.embedding.cosine_distance(query_embedding)
    query = (
        select(
            Chunk.id,
            Chunk.document_id,
            Chunk.text,
            Chunk.chunk_index,
            Chunk.page_number,
            Chunk.section_title,
            Chunk.char_start,
            Chunk.char_end,
            Document.title.label("doc_title"),
            Document.source_type,
            Document.source_url,
            (1 - distance).label("score"),
        )
        .join(Document, Document.id == Chunk.document_id)
        .where(
            Chunk.embedding.is_not(None),
            Document.status == DocumentStatus.ACTIVE,
            or_(
                Document.owner_id == user_id,
                Document.collection_id.in_(accessible_collection_ids) if accessible_collection_ids else false(),
            ),
        )
    )

    if collection_id:
        query = query.where(Document.collection_id == collection_id)
    if document_id:
        query = query.where(Chunk.document_id == document_id)
    if date_from:
        query = query.where(Document.created_at >= date_from)
    if date_to:
        query = query.where(Document.created_at <= date_to)
    if source_type:
        query = query.where(Document.source_type == source_type)
    if normalized_tags:
        tag_match = exists(
            select(1)
            .select_from(document_tags.join(Tag, Tag.id == document_tags.c.tag_id))
            .where(
                document_tags.c.document_id == Document.id,
                func.lower(Tag.name).in_(normalized_tags),
            )
        )
        query = query.where(tag_match)

    query = query.order_by(distance).limit(top_k)
    result = await db.execute(query)
    return [dict(row._mapping) for row in result.all()]
