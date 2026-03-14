"""
Analytics service — telemetry queries for the admin panel.
Returns: query volumes, retrieval quality, cost estimates, top documents.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Message
from app.models.document import Chunk, Document


async def get_query_stats(db: AsyncSession, user_id: uuid.UUID, days: int = 30) -> dict:
    """Message counts and token usage over the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    from sqlalchemy import and_
    from app.models.conversation import Conversation

    total_messages = await db.scalar(
        select(func.count(Message.id))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == user_id,
            Message.role == "assistant",
            Message.created_at >= since,
        )
    ) or 0

    total_tokens = await db.scalar(
        select(func.sum(Message.prompt_tokens + Message.completion_tokens))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == user_id,
            Message.role == "assistant",
            Message.created_at >= since,
        )
    ) or 0

    avg_latency = await db.scalar(
        select(func.avg(Message.latency_ms))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == user_id,
            Message.role == "assistant",
            Message.latency_ms.isnot(None),
            Message.created_at >= since,
        )
    )

    # Estimate cost: ~$5/1M tokens for gpt-4o (blended input+output)
    estimated_cost_usd = (total_tokens / 1_000_000) * 5.0

    return {
        "period_days": days,
        "total_queries": total_messages,
        "total_tokens": total_tokens,
        "estimated_cost_usd": round(estimated_cost_usd, 4),
        "avg_latency_ms": round(avg_latency or 0, 1),
    }


async def get_top_documents(db: AsyncSession, user_id: uuid.UUID, limit: int = 10) -> list:
    """Documents most frequently cited in chat responses."""
    sql = text("""
        SELECT
            d.id,
            d.title,
            d.source_type,
            d.chunk_count,
            COUNT(*) AS citation_count
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN chunks ch ON ch.document_id::text IN (
            SELECT jsonb_array_elements(m.retrieved_chunks) ->> 'document_id'
        )
        JOIN documents d ON d.id = ch.document_id
        WHERE c.user_id = :user_id
          AND m.role = 'assistant'
        GROUP BY d.id, d.title, d.source_type, d.chunk_count
        ORDER BY citation_count DESC
        LIMIT :limit
    """)
    result = await db.execute(sql, {"user_id": str(user_id), "limit": limit})
    return [dict(r) for r in result.mappings().all()]


async def get_retrieval_failures(db: AsyncSession, user_id: uuid.UUID, limit: int = 20) -> list:
    """
    Queries where the assistant said it couldn't find information
    (detected by keywords in the response).
    """
    from app.models.conversation import Conversation

    result = await db.execute(
        select(Message.id, Message.content, Message.created_at)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == user_id,
            Message.role == "assistant",
            Message.content.ilike("%don't have information%")
            | Message.content.ilike("%sources don't contain%")
            | Message.content.ilike("%I couldn't find%")
            | Message.content.ilike("%not in the provided%"),
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    return [
        {"message_id": str(r.id), "snippet": r.content[:200], "created_at": r.created_at}
        for r in result.all()
    ]


async def get_index_health(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Summary of document and chunk indexing health."""
    from app.models.document import DocumentStatus

    doc_by_status = await db.execute(
        select(Document.status, func.count(Document.id).label("count"))
        .where(Document.owner_id == user_id)
        .group_by(Document.status)
    )
    status_map = {row.status: row.count for row in doc_by_status}

    total_chunks = await db.scalar(
        select(func.count(Chunk.id)).where(Chunk.owner_id == user_id)
    ) or 0
    embedded_chunks = await db.scalar(
        select(func.count(Chunk.id)).where(Chunk.owner_id == user_id, Chunk.embedding.isnot(None))
    ) or 0

    return {
        "documents_by_status": status_map,
        "chunks": {"total": total_chunks, "embedded": embedded_chunks},
        "embedding_coverage": round(embedded_chunks / total_chunks * 100, 1) if total_chunks else 0,
    }
