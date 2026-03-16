"""
Embedding provider — uses OpenAI when configured and falls back to deterministic
local embeddings in development so ingestion and retrieval remain functional.
"""
import hashlib
import math
from typing import List

import openai
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings

_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def _has_valid_openai_key() -> bool:
    key = (settings.OPENAI_API_KEY or "").strip()
    return bool(key) and "placeholder" not in key.lower()


def _local_embed_text(text: str) -> List[float]:
    dims = settings.EMBEDDING_DIMENSIONS
    vector = [0.0] * dims
    tokens = [token for token in text.lower().split() if token]

    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % dims
        sign = -1.0 if digest[4] % 2 else 1.0
        magnitude = 0.5 + (digest[5] / 255)
        vector[bucket] += sign * magnitude

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector

    return [value / norm for value in vector]


async def _embed_with_fallback(texts: List[str]) -> List[List[float]]:
    return [_local_embed_text(text) for text in texts]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts. Returns list of float vectors."""
    if not texts:
        return []
    if not _has_valid_openai_key():
        return await _embed_with_fallback(texts)

    # OpenAI allows up to 2048 inputs per request
    all_embeddings: List[List[float]] = []
    batch_size = 100
    try:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await _client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=batch,
                dimensions=settings.EMBEDDING_DIMENSIONS,
            )
            all_embeddings.extend([d.embedding for d in response.data])
        return all_embeddings
    except Exception:
        if settings.ENVIRONMENT.lower() != "production":
            return await _embed_with_fallback(texts)
        raise


async def embed_query(text: str) -> List[float]:
    """Embed a single query string."""
    results = await embed_texts([text])
    return results[0]
