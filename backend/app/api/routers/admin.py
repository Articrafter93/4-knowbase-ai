"""
Admin router — system stats, job monitor, analytics and configuration.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser, require_role
from app.models.document import Document, DocumentStatus, IngestionJob
from app.models.user import UserRole
from app.services.analytics.telemetry import (
    get_index_health,
    get_query_stats,
    get_retrieval_failures,
    get_top_documents,
)
from app.core.config import settings

router = APIRouter(dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.OWNER))])


class AdminConfigResponse(BaseModel):
    rag_prompt: str
    memory_rule: str
    retrieval_backend: str
    top_k: int
    rerank_top_k: int


@router.get("/stats")
async def system_stats(db: DB, current_user: CurrentUser):
    """High-level system statistics."""
    doc_count = await db.scalar(select(func.count()).where(Document.owner_id == current_user.id))
    indexed_count = await db.scalar(
        select(func.count()).where(
            Document.owner_id == current_user.id,
            Document.status == DocumentStatus.ACTIVE
        )
    )
    pending_jobs = await db.scalar(
        select(func.count()).where(
            IngestionJob.owner_id == current_user.id,
            IngestionJob.status.in_(["queued", "parsing", "chunking", "embedding"])
        )
    )
    return {
        "documents": {"total": doc_count, "indexed": indexed_count},
        "ingestion_jobs": {"active": pending_jobs},
    }


@router.get("/jobs")
async def list_jobs(db: DB, current_user: CurrentUser, limit: int = 20):
    """List recent ingestion jobs."""
    result = await db.execute(
        select(IngestionJob)
        .where(IngestionJob.owner_id == current_user.id)
        .order_by(IngestionJob.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id),
            "document_id": str(j.document_id),
            "status": j.status,
            "progress": j.progress,
            "error_message": j.error_message,
            "created_at": j.created_at,
        }
        for j in jobs
    ]


# ── Phase 2 Analytics ─────────────────────────────────────────────────────────

@router.get("/analytics/queries")
async def query_analytics(
    db: DB,
    current_user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
):
    """Query volume, token usage and cost estimates."""
    return await get_query_stats(db, current_user.id, days=days)


@router.get("/analytics/top-documents")
async def top_documents(db: DB, current_user: CurrentUser, limit: int = Query(default=10, ge=1, le=50)):
    """Documents most frequently cited in RAG responses."""
    return await get_top_documents(db, current_user.id, limit=limit)


@router.get("/analytics/retrieval-failures")
async def retrieval_failures(db: DB, current_user: CurrentUser, limit: int = Query(default=20, ge=1, le=100)):
    """Queries where the model reported insufficient source coverage."""
    return await get_retrieval_failures(db, current_user.id, limit=limit)


@router.get("/analytics/index-health")
async def index_health(db: DB, current_user: CurrentUser):
    """Chunk embedding coverage and document status breakdown."""
    return await get_index_health(db, current_user.id)


@router.get("/config", response_model=AdminConfigResponse)
async def get_admin_config(current_user: CurrentUser):
    return AdminConfigResponse(
        rag_prompt=(
            "Answer using only the retrieved sources. Cite each claim. "
            "If the answer is missing, say so clearly."
        ),
        memory_rule=(
            "Extract stable user facts, preferences and project context that will improve "
            "future answers. Keep memories editable and namespace-aware."
        ),
        retrieval_backend=settings.RETRIEVAL_BACKEND,
        top_k=settings.RETRIEVAL_TOP_K,
        rerank_top_k=settings.RERANK_TOP_K,
    )
