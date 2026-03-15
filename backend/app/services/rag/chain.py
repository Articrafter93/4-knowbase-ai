"""
LangGraph RAG chain — Phase 2: hybrid retrieval, semantic memory, LLM reranker, memory extraction.
Nodes: route_intent → retrieve_chunks → retrieve_memories → rerank → build_context → generate → extract_citations → update_memory
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import structlog
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from app.core.config import settings
from app.services.embeddings.provider import embed_query
from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.retrieval.reranker import llm_rerank
from app.services.memory.store import semantic_memory_search
from app.services.security.trimming import get_accessible_collection_ids

log = structlog.get_logger()

_llm = ChatOpenAI(
    model=settings.LLM_PRIMARY_MODEL,
    api_key=settings.OPENAI_API_KEY,
    streaming=True,
    temperature=0.3,
)

_router_llm = ChatOpenAI(
    model=settings.LLM_ROUTING_MODEL,
    api_key=settings.OPENAI_API_KEY,
    temperature=0,
)




class RAGState(TypedDict):
    # Input
    query: str
    user_id: str
    collection_id: Optional[str]
    date_from: Optional[datetime]
    date_to: Optional[datetime]
    tags: list[str]
    db_session: Any
    conversation_id: Optional[str]
    top_k: int
    # Pipeline
    intent: str
    query_embedding: Optional[list]
    retrieved_chunks: list[dict]
    memories: list[dict]
    context: str
    # Output
    answer: str
    citations: list[dict]
    retrieval_metadata: dict
    memories_extracted: int


# ── Nodes ─────────────────────────────────────────────────────────────────────

async def route_intent(state: RAGState) -> RAGState:
    """Classify the user's intent to guide retrieval strategy."""
    response = await _router_llm.ainvoke([
        {"role": "system", "content": "Classify the user's intent as one of: search, summarize, compare, extract, task, chat. Respond with just the label."},
        {"role": "user", "content": state["query"]},
    ])
    state["intent"] = response.content.strip().lower()
    log.debug("Intent classified", intent=state["intent"])
    return state


async def retrieve_chunks(state: RAGState) -> RAGState:
    """Embed query then retrieve via hybrid (pgvector + Qdrant + RRF)."""
    embedding = await embed_query(state["query"])
    state["query_embedding"] = embedding

    db = state["db_session"]
    collection_id = uuid.UUID(state["collection_id"]) if state.get("collection_id") else None
    accessible_collection_ids = await get_accessible_collection_ids(
        db=db,
        user_id=uuid.UUID(state["user_id"]),
    )
    chunks = await retrieve_hybrid(
        db=db,
        query_embedding=embedding,
        user_id=uuid.UUID(state["user_id"]),
        accessible_collection_ids=accessible_collection_ids,
        top_k=state.get("top_k") or settings.RETRIEVAL_TOP_K,
        collection_id=collection_id,
        tags=state.get("tags") or None,
        date_from=state.get("date_from"),
        date_to=state.get("date_to"),
    )
    state["retrieved_chunks"] = chunks
    log.debug("Hybrid retrieval", count=len(chunks), backend=settings.RETRIEVAL_BACKEND)
    return state


async def retrieve_memories(state: RAGState) -> RAGState:
    """Semantic search over user's personal memories (Phase 2)."""
    if not state.get("query_embedding"):
        state["memories"] = []
        return state
    db = state["db_session"]
    memories = await semantic_memory_search(
        db=db,
        query_embedding=state["query_embedding"],
        user_id=uuid.UUID(state["user_id"]),
        top_k=6,
        min_score=0.65,
    )
    state["memories"] = memories
    log.debug("Memory retrieval", count=len(memories))
    return state


async def rerank(state: RAGState) -> RAGState:
    """LLM-based cross-encoder reranking of retrieved chunks."""
    reranked = await llm_rerank(
        query=state["query"],
        chunks=state["retrieved_chunks"],
        top_k=settings.RERANK_TOP_K,
    )
    state["retrieved_chunks"] = reranked
    return state


async def build_context(state: RAGState) -> RAGState:
    """Build the final context prompt from retrieved chunks + memories."""
    chunks = state["retrieved_chunks"]
    memory_lines = [f"- {m['content']}" for m in state.get("memories", [])]

    context_parts = []
    for i, chunk in enumerate(chunks):
        doc_title = chunk.get("doc_title", "Unknown")
        page = chunk.get("page_number")
        loc = f", page {page}" if page else ""
        context_parts.append(
            f"[SOURCE {i+1} | {doc_title}{loc}]\n{chunk['text']}"
        )

    memory_block = ""
    if memory_lines:
        memory_block = "\n\n[PERSONAL CONTEXT]\n" + "\n".join(memory_lines)

    state["context"] = "\n\n---\n\n".join(context_parts) + memory_block
    return state


async def generate(state: RAGState) -> RAGState:
    """
    Generate a response with streaming. The answer is accumulated here;
    the router endpoint streams it via SSE.
    """
    system_prompt = (
        "You are an expert knowledge assistant. Answer the user's question exclusively "
        "based on the provided sources. For every claim, cite the source using [SOURCE N]. "
        "If the sources don't contain the answer, say so clearly. "
        "Be precise, concise and professional."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"SOURCES:\n{state['context']}\n\nQUESTION: {state['query']}"},
    ]
    # Non-streaming for graph coherence; routing layer streams separately
    response = await _llm.ainvoke(messages)
    state["answer"] = response.content
    state["retrieval_metadata"] = {
        "intent": state.get("intent"),
        "chunk_count": len(state["retrieved_chunks"]),
        "backend": settings.RETRIEVAL_BACKEND,
    }
    return state


async def extract_citations(state: RAGState) -> RAGState:
    """Map [SOURCE N] references in the answer to actual chunk metadata."""
    citations = []
    answer = state.get("answer", "")
    chunks = state["retrieved_chunks"]
    for i, chunk in enumerate(chunks):
        marker = f"[SOURCE {i+1}]"
        if marker in answer:
            citations.append({
                "marker": marker,
                "source_index": i,
                "chunk_id": str(chunk.get("id", "")),
                "document_id": str(chunk.get("document_id", "")),
                "doc_title": chunk.get("doc_title", ""),
                "page_number": chunk.get("page_number"),
                "section_title": chunk.get("section_title"),
                "fragment": chunk["text"][:300],
                "score": chunk.get("score", 0),
                "source_url": chunk.get("source_url"),
            })
    state["citations"] = citations
    return state

async def update_memory(state: RAGState) -> RAGState:
    """Extract memorable facts from this turn and persist them (Phase 2)."""
    answer = state.get("answer", "")
    query = state.get("query", "")
    if not answer or not query:
        state["memories_extracted"] = 0
        return state
    try:
        from app.services.memory.extractor import extract_memories_from_turn, save_extracted_memories
        conv_id = uuid.UUID(state["conversation_id"]) if state.get("conversation_id") else None
        extracted = await extract_memories_from_turn(query, answer, uuid.UUID(state["user_id"]))
        saved = await save_extracted_memories(state["db_session"], extracted, uuid.UUID(state["user_id"]), conv_id)
        state["memories_extracted"] = saved
        log.debug("Memories extracted", count=saved)
    except Exception as exc:
        log.warning("Memory extraction failed", error=str(exc))
        state["memories_extracted"] = 0
    return state


# ── Graph definition ──────────────────────────────────────────────────────────

def build_rag_graph() -> Any:
    graph = StateGraph(RAGState)

    graph.add_node("route_intent", route_intent)
    graph.add_node("retrieve_chunks", retrieve_chunks)
    graph.add_node("retrieve_memories", retrieve_memories)
    graph.add_node("rerank", rerank)
    graph.add_node("build_context", build_context)
    graph.add_node("generate", generate)
    graph.add_node("extract_citations", extract_citations)
    graph.add_node("update_memory", update_memory)

    graph.set_entry_point("route_intent")
    graph.add_edge("route_intent", "retrieve_chunks")
    graph.add_edge("retrieve_chunks", "retrieve_memories")
    graph.add_edge("retrieve_memories", "rerank")
    graph.add_edge("rerank", "build_context")
    graph.add_edge("build_context", "generate")
    graph.add_edge("generate", "extract_citations")
    graph.add_edge("extract_citations", "update_memory")
    graph.add_edge("update_memory", END)

    return graph.compile()


rag_graph = build_rag_graph()


async def run_rag(
    query: str,
    user_id: str,
    db_session: Any,
    collection_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    tags: Optional[list[str]] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    top_k: Optional[int] = None,
) -> dict:
    """Execute the full RAG pipeline (Phase 2: hybrid + memory + reranker + extraction)."""
    initial_state: RAGState = {
        "query": query,
        "user_id": user_id,
        "collection_id": collection_id,
        "date_from": date_from,
        "date_to": date_to,
        "tags": tags or [],
        "conversation_id": conversation_id,
        "db_session": db_session,
        "top_k": top_k or settings.RETRIEVAL_TOP_K,
        "intent": "",
        "query_embedding": None,
        "retrieved_chunks": [],
        "memories": [],
        "context": "",
        "answer": "",
        "citations": [],
        "retrieval_metadata": {},
        "memories_extracted": 0,
    }
    final_state = await rag_graph.ainvoke(initial_state)
    return {
        "answer": final_state["answer"],
        "citations": final_state["citations"],
        "retrieval_metadata": final_state["retrieval_metadata"],
        "retrieved_chunks": final_state["retrieved_chunks"],
        "active_memories": final_state["memories"],
        "memories_extracted": final_state.get("memories_extracted", 0),
    }
