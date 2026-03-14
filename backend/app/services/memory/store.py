"""
Semantic memory store — embed queries and search over user memories via pgvector.
Phase 2: replaces the stub in the LangGraph retrieve_memories node.
"""
import uuid
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.memory import Memory, MemoryType
from app.services.embeddings.provider import embed_texts


async def embed_and_store_memory(db: AsyncSession, memory: Memory) -> None:
    """Generate embedding for a memory and persist it."""
    embeddings = await embed_texts([memory.content])
    memory.embedding = embeddings[0]
    await db.commit()


async def semantic_memory_search(
    db: AsyncSession,
    query_embedding: List[float],
    user_id: uuid.UUID,
    namespace: Optional[str] = None,
    top_k: int = 6,
    min_score: float = 0.65,
) -> List[dict]:
    """
    Search user memories by semantic similarity.
    - Always scoped to user_id (security trimming).
    - Optional namespace filter (e.g. 'general', 'preferences', 'projects').
    - Returns only memories above min_score threshold.
    """
    namespace_clause = "AND m.namespace = :namespace" if namespace else ""
    sql = text(f"""
        SELECT
            m.id,
            m.content,
            m.memory_type,
            m.namespace,
            m.importance,
            m.tags,
            1 - (m.embedding <=> CAST(:embedding AS vector)) AS score
        FROM memories m
        WHERE m.user_id = :user_id
          AND m.embedding IS NOT NULL
          {namespace_clause}
        ORDER BY m.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    params: dict = {
        "user_id": str(user_id),
        "embedding": query_embedding,
        "top_k": top_k,
    }
    if namespace:
        params["namespace"] = namespace

    result = await db.execute(sql, params)
    rows = result.mappings().all()
    return [dict(r) for r in rows if r["score"] >= min_score]


async def ensure_all_memories_embedded(db: AsyncSession, user_id: uuid.UUID) -> int:
    """
    Backfill: embed any memories that are missing their vector.
    Returns count of memories embedded.
    """
    from sqlalchemy import select
    result = await db.execute(
        select(Memory)
        .where(Memory.user_id == user_id, Memory.embedding.is_(None))
    )
    unembedded = result.scalars().all()
    if not unembedded:
        return 0

    texts = [m.content for m in unembedded]
    embeddings = await embed_texts(texts)
    for mem, emb in zip(unembedded, embeddings):
        mem.embedding = emb
    await db.commit()
    return len(unembedded)
