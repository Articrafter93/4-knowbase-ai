"""
Qdrant vector store — dense retrieval with payload filters and hybrid-ready shape.
"""
from datetime import datetime
from typing import List, Optional

import structlog
from qdrant_client import QdrantClient, AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    SparseIndexParams,
    SparseVectorParams,
    VectorParams,
    SparseVector,
    NamedVector,
    NamedSparseVector,
    SearchRequest,
    RecommendRequest,
)

from app.core.config import settings

log = structlog.get_logger()

_client: AsyncQdrantClient | None = None

DENSE_VECTOR = "dense"
SPARSE_VECTOR = "sparse"


def get_qdrant_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY or None,
        )
    return _client


async def ensure_collection_exists(collection_name: str = None) -> None:
    """Create Qdrant collection with named dense + sparse vectors if it doesn't exist."""
    collection_name = collection_name or settings.QDRANT_COLLECTION
    client = get_qdrant_client()
    try:
        await client.get_collection(collection_name)
        log.debug("Qdrant collection exists", name=collection_name)
    except Exception:
        await client.create_collection(
            collection_name=collection_name,
            vectors_config={
                DENSE_VECTOR: VectorParams(
                    size=settings.EMBEDDING_DIMENSIONS,
                    distance=Distance.COSINE,
                ),
            },
            sparse_vectors_config={
                SPARSE_VECTOR: SparseVectorParams(
                    index=SparseIndexParams(on_disk=False),
                ),
            },
        )
        log.info("Created Qdrant collection", name=collection_name)


async def upsert_chunk_to_qdrant(
    chunk_id: str,
    document_id: str,
    owner_id: str,
    collection_id: Optional[str],
    status: str,
    text: str,
    dense_embedding: List[float],
    metadata: dict | None = None,
) -> None:
    """Insert or update a chunk in Qdrant with dense embedding + payload."""
    client = get_qdrant_client()
    await ensure_collection_exists()

    payload = {
        "chunk_id": chunk_id,
        "document_id": document_id,
        "owner_id": owner_id,
        "collection_id": collection_id or "",
        "status": status,
        "text": text,
        **(metadata or {}),
    }

    point = PointStruct(
        id=chunk_id,
        vector={DENSE_VECTOR: dense_embedding},
        payload=payload,
    )
    await get_qdrant_client().upsert(
        collection_name=settings.QDRANT_COLLECTION,
        points=[point],
    )


async def hybrid_search(
    query_embedding: List[float],
    owner_id: str,
    top_k: int = 20,
    collection_id: Optional[str] = None,
    accessible_collection_ids: Optional[list[str]] = None,
    tags: Optional[list[str]] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    source_type: Optional[str] = None,
) -> List[dict]:
    """
    Hybrid retrieval: dense vector search in Qdrant.
    Security trimming via `owner_id` payload filter.
    Returns ranked list of chunk dicts.
    """
    client = get_qdrant_client()

    # Build filter: always scope to owner and Active status
    must_conditions = [FieldCondition(key="status", match=MatchValue(value="active"))]
    should_conditions = [FieldCondition(key="owner_id", match=MatchValue(value=owner_id))]

    if collection_id:
        must_conditions.append(FieldCondition(key="collection_id", match=MatchValue(value=collection_id)))
    elif accessible_collection_ids:
        should_conditions.extend(
            FieldCondition(key="collection_id", match=MatchValue(value=item))
            for item in accessible_collection_ids
            if item
        )

    if source_type:
        must_conditions.append(FieldCondition(key="source_type", match=MatchValue(value=source_type)))

    if tags:
        for tag in tags:
            must_conditions.append(FieldCondition(key="tags[]", match=MatchValue(value=tag)))

    if date_from or date_to:
        log.info("Qdrant date filters requested; enforcing via pgvector fallback only")
        return []

    search_filter = Filter(
        must=must_conditions,
        should=should_conditions,
        min_should=1,
    )

    results = await client.search(
        collection_name=settings.QDRANT_COLLECTION,
        query_vector=NamedVector(name=DENSE_VECTOR, vector=query_embedding),
        query_filter=search_filter,
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "id": str(r.id),
            "document_id": r.payload.get("document_id"),
            "text": r.payload.get("text", ""),
            "doc_title": r.payload.get("doc_title", ""),
            "page_number": r.payload.get("page_number"),
            "section_title": r.payload.get("section_title"),
            "source_url": r.payload.get("source_url"),
            "source_type": r.payload.get("source_type"),
            "score": r.score,
        }
        for r in results
    ]
