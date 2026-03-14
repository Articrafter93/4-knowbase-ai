"""
Search router — full-text + vector hybrid search with filters.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.deps import CurrentUser, DB
from app.services.embeddings.provider import embed_query
from app.services.vector_store.pgvector_store import similarity_search

router = APIRouter()


@router.get("/")
async def hybrid_search(
    q: str = Query(..., min_length=1),
    collection_id: Optional[uuid.UUID] = None,
    source_type: Optional[str] = None,
    top_k: int = Query(10, le=50),
    current_user: CurrentUser = None,
    db: DB = None,
):
    """
    Hybrid search: vector similarity (pgvector) — Qdrant hybrid added in Phase 2.
    Applies security trimming: always filters by owner_id.
    """
    query_embedding = await embed_query(q)
    results = await similarity_search(
        db=db,
        query_embedding=query_embedding,
        owner_id=current_user.id,
        top_k=top_k,
        collection_id=collection_id,
    )
    return {
        "query": q,
        "results": [
            {
                "chunk_id": str(r["id"]),
                "document_id": str(r["document_id"]),
                "doc_title": r["doc_title"],
                "fragment": r["text"][:400],
                "score": round(float(r["score"]), 4),
                "page_number": r.get("page_number"),
                "section_title": r.get("section_title"),
                "source_type": r.get("source_type"),
                "source_url": r.get("source_url"),
            }
            for r in results
        ],
        "total": len(results),
        "backend": "pgvector",
    }
