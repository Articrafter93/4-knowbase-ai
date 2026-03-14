"""
Hybrid retrieval — merges pgvector and Qdrant results using Reciprocal Rank Fusion (RRF).
Applies security trimming: results are always owner-scoped.
"""
import uuid
from typing import List, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.vector_store.pgvector_store import similarity_search

log = structlog.get_logger()


def _rrf_merge(
    pgvector_results: List[dict],
    qdrant_results: List[dict],
    top_k: int,
    k: int = 60,  # RRF constant — higher = less rank dominance
) -> List[dict]:
    """
    Reciprocal Rank Fusion: combines two ranked lists into one.
    Score = sum of 1/(k + rank_i) for each list the document appears in.
    """
    scores: dict[str, float] = {}
    payloads: dict[str, dict] = {}

    for rank, result in enumerate(pgvector_results):
        doc_key = str(result.get("id", ""))
        scores[doc_key] = scores.get(doc_key, 0.0) + 1.0 / (k + rank + 1)
        payloads[doc_key] = {**result, "source": "pgvector"}

    for rank, result in enumerate(qdrant_results):
        # Qdrant returns chunk_id as "id"
        doc_key = str(result.get("id", ""))
        scores[doc_key] = scores.get(doc_key, 0.0) + 1.0 / (k + rank + 1)
        if doc_key not in payloads:
            payloads[doc_key] = {**result, "source": "qdrant"}
        else:
            payloads[doc_key]["source"] = "hybrid"
            payloads[doc_key]["score"] = scores[doc_key]  # update score

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [payloads[k] for k, _ in ranked if k in payloads]


async def retrieve_hybrid(
    db: AsyncSession,
    query_embedding: List[float],
    owner_id: uuid.UUID,
    top_k: int = 20,
    collection_id: Optional[uuid.UUID] = None,
) -> List[dict]:
    """
    Retrieve from pgvector and optionally Qdrant, then fuse with RRF.
    Backend selection controlled by RETRIEVAL_BACKEND env var.
    """
    backend = settings.RETRIEVAL_BACKEND.lower()
    col_str = str(collection_id) if collection_id else None

    pgvector_results: List[dict] = []
    qdrant_results: List[dict] = []

    # pgvector is always queried (it's the canonical store)
    if backend in ("pgvector", "hybrid"):
        pgvector_results = await similarity_search(
            db=db,
            query_embedding=query_embedding,
            owner_id=owner_id,
            top_k=top_k,
            collection_id=collection_id,
        )
        log.debug("pgvector results", count=len(pgvector_results))

    # Qdrant is optional
    if backend in ("qdrant", "hybrid"):
        try:
            from app.services.vector_store.qdrant_store import hybrid_search
            qdrant_results = await hybrid_search(
                query_embedding=query_embedding,
                owner_id=str(owner_id),
                top_k=top_k,
                collection_id=col_str,
            )
            log.debug("Qdrant results", count=len(qdrant_results))
        except Exception as exc:
            log.warning("Qdrant unavailable, falling back to pgvector only", error=str(exc))

    if backend == "hybrid" and pgvector_results and qdrant_results:
        return _rrf_merge(pgvector_results, qdrant_results, top_k=top_k)
    elif qdrant_results:
        return qdrant_results
    return pgvector_results
