"""
Memory extractor — uses LLM to extract memorable facts from conversation turns.
Runs after each assistant response and optionally persists new memories.
"""
import json
import uuid
from typing import List

import structlog
from langchain_openai import ChatOpenAI

from app.core.config import settings
from app.models.memory import Memory, MemoryType

log = structlog.get_logger()

_extractor_llm = ChatOpenAI(
    model=settings.LLM_ROUTING_MODEL,   # cheap model for extraction
    api_key=settings.OPENAI_API_KEY,
    temperature=0,
)

EXTRACT_SYSTEM = """You extract memorable personal facts from conversations.
Given a conversation snippet, identify facts worth remembering about the USER:
- Preferences (e.g., "I prefer bullet points")
- Projects they are working on
- People they mention
- Personal context (role, field, goals)
- Recurring facts about their work or life

Output ONLY a valid JSON array of objects with this shape:
[{"content": "fact text", "memory_type": "fact|preference|project|person|context", "importance": 1-10}]

Rules:
- Only extract facts ABOUT THE USER, not general knowledge.
- Maximum 3 items per turn.
- If nothing is worth remembering, output [].
- Be concise — each fact should be one clear sentence.
"""


async def extract_memories_from_turn(
    user_message: str,
    assistant_message: str,
    user_id: uuid.UUID,
) -> List[dict]:
    """
    Extract memorable facts from a conversation turn.
    Returns list of raw memory dicts (not yet persisted).
    """
    prompt = f"USER: {user_message}\nASSISTANT: {assistant_message}"
    try:
        response = await _extractor_llm.ainvoke([
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": prompt},
        ])
        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        memories = json.loads(raw)
        log.debug("Extracted memories", count=len(memories), user_id=str(user_id))
        return memories
    except Exception as exc:
        log.warning("Memory extraction failed", error=str(exc))
        return []


async def save_extracted_memories(
    db,
    memories: List[dict],
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
) -> int:
    """Persist extracted memory dicts to DB, then embed them."""
    from app.services.memory.store import embed_and_store_memory

    saved = 0
    for m in memories:
        try:
            mem_type = m.get("memory_type", "fact")
            if mem_type not in [t.value for t in MemoryType]:
                mem_type = "fact"
            memory = Memory(
                user_id=user_id,
                content=m["content"],
                memory_type=mem_type,
                importance=max(1, min(10, int(m.get("importance", 5)))),
                source_conversation_id=conversation_id,
            )
            db.add(memory)
            await db.flush()
            await embed_and_store_memory(db, memory)
            saved += 1
        except Exception as exc:
            log.warning("Failed to save memory", error=str(exc))
    return saved
