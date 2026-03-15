"""
Search router — hybrid search with security trimming and rich filters.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query

from app.core.config import settings
from app.core.deps import CurrentUser, DB
from app.services.embeddings.provider import embed_query
from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.security.trimming import get_accessible_collection_ids

router = APIRouter()


@router.get("/")
async def hybrid_search(
    q: str = Query(..., min_length=1),
    collection_id: Optional[uuid.UUID] = None,
    source_type: Optional[str] = None,
    tags: list[str] = Query(default_factory=list),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    top_k: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = None,
    db: DB = None,
):
    query_embedding = await embed_query(q)
    accessible_collection_ids = await get_accessible_collection_ids(db, current_user.id)
    results = await retrieve_hybrid(
        db=db,
        query_embedding=query_embedding,
        user_id=current_user.id,
        accessible_collection_ids=accessible_collection_ids,
        top_k=top_k,
        collection_id=collection_id,
        tags=tags or None,
        date_from=date_from,
        date_to=date_to,
        source_type=source_type,
    )

    return {
        "query": q,
        "filters": {
            "collection_id": str(collection_id) if collection_id else None,
            "source_type": source_type,
            "tags": tags,
            "date_from": date_from,
            "date_to": date_to,
        },
        "results": [
            {
                "chunk_id": str(result["id"]),
                "document_id": str(result["document_id"]),
                "doc_title": result["doc_title"],
                "fragment": result["text"][:400],
                "score": round(float(result["score"]), 4),
                "page_number": result.get("page_number"),
                "section_title": result.get("section_title"),
                "source_type": result.get("source_type"),
                "source_url": result.get("source_url"),
                "engine": result.get("source", settings.RETRIEVAL_BACKEND),
            }
            for result in results
        ],
        "total": len(results),
        "backend": settings.RETRIEVAL_BACKEND,
    }
