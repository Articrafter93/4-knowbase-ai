"""
Memory router — CRUD for personal memory entries.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.memory import Memory, MemoryType

router = APIRouter()


class MemoryCreate(BaseModel):
    content: str
    memory_type: MemoryType = MemoryType.FACT
    namespace: str = "general"
    importance: int = 5
    tags: Optional[list[str]] = None


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    importance: Optional[int] = None
    namespace: Optional[str] = None
    tags: Optional[list[str]] = None


@router.get("/")
async def list_memories(
    current_user: CurrentUser,
    db: DB,
    namespace: Optional[str] = None,
    memory_type: Optional[MemoryType] = None,
):
    q = select(Memory).where(Memory.user_id == current_user.id)
    if namespace:
        q = q.where(Memory.namespace == namespace)
    if memory_type:
        q = q.where(Memory.memory_type == memory_type)
    q = q.order_by(Memory.importance.desc(), Memory.updated_at.desc())
    result = await db.execute(q)
    memories = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "content": m.content,
            "memory_type": m.memory_type,
            "namespace": m.namespace,
            "importance": m.importance,
            "tags": m.tags,
            "created_at": m.created_at,
            "updated_at": m.updated_at,
        }
        for m in memories
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_memory(body: MemoryCreate, current_user: CurrentUser, db: DB):
    mem = Memory(user_id=current_user.id, **body.model_dump())
    db.add(mem)
    await db.flush()
    # Phase 2: auto-embed after creation
    try:
        from app.services.memory.store import embed_and_store_memory
        await embed_and_store_memory(db, mem)
    except Exception:
        await db.commit()  # save without embedding; extractor will backfill
    await db.commit()
    await db.refresh(mem)
    return {"id": str(mem.id), "content": mem.content, "embedded": mem.embedding is not None}


@router.patch("/{memory_id}")
async def update_memory(memory_id: uuid.UUID, body: MemoryUpdate, current_user: CurrentUser, db: DB):
    mem = await db.get(Memory, memory_id)
    if not mem or mem.user_id != current_user.id:
        raise HTTPException(status_code=404)
    content_changed = body.content is not None and body.content != mem.content
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(mem, field, val)
    if content_changed:
        # Re-embed on content change
        try:
            from app.services.memory.store import embed_and_store_memory
            await embed_and_store_memory(db, mem)
        except Exception:
            pass
    await db.commit()
    return {"id": str(mem.id), "content": mem.content}


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(memory_id: uuid.UUID, current_user: CurrentUser, db: DB):
    mem = await db.get(Memory, memory_id)
    if not mem or mem.user_id != current_user.id:
        raise HTTPException(status_code=404)
    await db.delete(mem)
    await db.commit()
