"""
Embedding provider — wraps OpenAI embeddings with retry and batching.
"""
from typing import List
import openai
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings

_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts. Returns list of float vectors."""
    if not texts:
        return []
    # OpenAI allows up to 2048 inputs per request
    all_embeddings: List[List[float]] = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await _client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
            dimensions=settings.EMBEDDING_DIMENSIONS,
        )
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings


async def embed_query(text: str) -> List[float]:
    """Embed a single query string."""
    results = await embed_texts([text])
    return results[0]
