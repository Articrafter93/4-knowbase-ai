"""
Cross-encoder reranker — re-scores (query, chunk) pairs to improve top-K quality.
Uses OpenAI LLM as a zero-shot reranker (works without extra model download).
Phase 2: swap for a local cross-encoder (e.g. bge-reranker-v2-m3) in Phase 3.
"""
import json
from typing import List

import structlog
from langchain_openai import ChatOpenAI

from app.core.config import settings

log = structlog.get_logger()


def _has_valid_openai_key() -> bool:
    key = (settings.OPENAI_API_KEY or "").strip()
    return bool(key) and "placeholder" not in key.lower()

_rerank_llm = ChatOpenAI(
    model=settings.LLM_ROUTING_MODEL,
    api_key=settings.OPENAI_API_KEY,
    temperature=0,
)

RERANK_SYSTEM = """You are a relevance ranker. Given a query and a list of text chunks,
output a JSON array of the chunk indices (0-based) sorted by relevance to the query,
most relevant first. Include only indices you consider relevant.
Output ONLY a valid JSON array of integers, e.g. [2, 0, 4, 1]. Nothing else."""


async def llm_rerank(query: str, chunks: List[dict], top_k: int = 6) -> List[dict]:
    """
    Re-rank chunks using LLM zero-shot relevance scoring.
    Falls back to original order on any error.
    """
    if not chunks or len(chunks) <= top_k:
        return chunks[:top_k]
    if not _has_valid_openai_key():
        return chunks[:top_k]

    # Build snippet list for LLM
    snippet_lines = "\n".join(
        f"[{i}] {c.get('text', c.get('fragment', ''))[:300]}"
        for i, c in enumerate(chunks)
    )
    prompt = f"QUERY: {query}\n\nCHUNKS:\n{snippet_lines}"

    try:
        response = await _rerank_llm.ainvoke([
            {"role": "system", "content": RERANK_SYSTEM},
            {"role": "user", "content": prompt},
        ])
        raw = response.content.strip().strip("```json").strip("```")
        ranking = json.loads(raw)
        if not isinstance(ranking, list):
            raise ValueError("Expected list")

        reranked = []
        seen = set()
        for idx in ranking:
            if isinstance(idx, int) and 0 <= idx < len(chunks) and idx not in seen:
                reranked.append(chunks[idx])
                seen.add(idx)
                if len(reranked) >= top_k:
                    break

        # Append any missing chunks up to top_k (fallback)
        for i, c in enumerate(chunks):
            if i not in seen and len(reranked) < top_k:
                reranked.append(c)

        log.debug("Reranked", original=len(chunks), final=len(reranked))
        return reranked

    except Exception as exc:
        log.warning("Reranker failed, using original order", error=str(exc))
        return chunks[:top_k]
