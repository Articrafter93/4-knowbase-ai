"""
Local embeddings provider — fastembed as a drop-in alternative to OpenAI.
Controlled by EMBEDDING_BACKEND env var: openai (default) | fastembed.
"""
from typing import List

import structlog

from app.core.config import settings

log = structlog.get_logger()

_fastembed_model = None


def _get_fastembed():
    """Lazy-load fastembed model (downloads on first use, ~100MB)."""
    global _fastembed_model
    if _fastembed_model is None:
        try:
            from fastembed import TextEmbedding
            model_name = settings.FASTEMBED_MODEL  # e.g. "BAAI/bge-small-en-v1.5"
            _fastembed_model = TextEmbedding(model_name=model_name)
            log.info("Loaded fastembed model", model=model_name)
        except ImportError:
            raise RuntimeError("fastembed not installed. Add it to dependencies or set EMBEDDING_BACKEND=openai")
    return _fastembed_model


async def embed_texts_local(texts: List[str]) -> List[List[float]]:
    """
    Embed texts using fastembed (runs locally, no API cost).
    Returns list of embedding vectors.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    model = _get_fastembed()

    # fastembed is sync — run in thread pool
    def _embed():
        return list(model.embed(texts))

    embeddings = await loop.run_in_executor(None, _embed)
    return [e.tolist() for e in embeddings]


async def embed_query_local(text: str) -> List[float]:
    embeddings = await embed_texts_local([text])
    return embeddings[0]


# ── Unified embedding interface — respects EMBEDDING_BACKEND ─────────────────

async def embed_texts_auto(texts: List[str]) -> List[List[float]]:
    """Route to OpenAI or fastembed based on EMBEDDING_BACKEND setting."""
    backend = settings.EMBEDDING_BACKEND.lower()
    if backend == "fastembed":
        return await embed_texts_local(texts)
    else:
        from app.services.embeddings.provider import embed_texts
        return await embed_texts(texts)


async def embed_query_auto(text: str) -> List[float]:
    """Route single query embedding to the configured backend."""
    backend = settings.EMBEDDING_BACKEND.lower()
    if backend == "fastembed":
        return await embed_query_local(text)
    else:
        from app.services.embeddings.provider import embed_query
        return await embed_query(text)
