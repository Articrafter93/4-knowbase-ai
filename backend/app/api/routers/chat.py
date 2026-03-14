"""
Chat router — streaming RAG conversation via Server-Sent Events.
"""
import json
import time
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import CurrentUser, DB
from app.models.conversation import Conversation, Message
from app.services.rag.chain import run_rag

router = APIRouter()


    collection_id: Optional[str] = None


class MessageFeedbackRequest(BaseModel):
    feedback: str  # "like" | "dislike"
    notes: Optional[str] = None


async def _stream_rag_response(
    query: str,
    user_id: str,
    db,
    collection_id: Optional[str],
    conversation_id: Optional[str],
):
    """Generator that runs RAG pipeline and streams result as SSE events."""
    start = time.monotonic()
    try:
        # Emit status event
        yield f"data: {json.dumps({'type': 'status', 'content': 'Retrieving relevant sources...'})}\n\n"

        result = await run_rag(
            query=query,
            user_id=user_id,
            db_session=db,
            collection_id=collection_id,
        )

        # Emit citations first
        yield f"data: {json.dumps({'type': 'citations', 'content': result['citations']})}\n\n"

        # Stream answer in word chunks (simulate token-level streaming)
        answer = result["answer"]
        words = answer.split()
        chunk_buffer = []
        for i, word in enumerate(words):
            chunk_buffer.append(word)
            if len(chunk_buffer) >= 5 or i == len(words) - 1:
                chunk_text = " ".join(chunk_buffer) + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk_text})}\n\n"
                chunk_buffer = []

        latency_ms = int((time.monotonic() - start) * 1000)

        # Emit done event with metadata
        yield f"data: {json.dumps({'type': 'done', 'retrieval_metadata': result['retrieval_metadata'], 'latency_ms': latency_ms})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"


@router.post("/")
async def chat(body: ChatRequest, current_user: CurrentUser, db: DB):
    """Stream a RAG response for the given query."""
    return StreamingResponse(
        _stream_rag_response(
            query=body.query,
            user_id=str(current_user.id),
            db=db,
            collection_id=body.collection_id,
            conversation_id=body.conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def list_conversations(current_user: CurrentUser, db: DB):
    """List all conversations for the current user."""
    from sqlalchemy import select
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    convs = result.scalars().all()
    return [{"id": str(c.id), "title": c.title, "created_at": c.created_at} for c in convs]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """Get messages for a specific conversation."""
    conv = await db.get(Conversation, conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "retrieved_chunks": m.retrieved_chunks,
            "created_at": m.created_at,
        }
        for m in conv.messages
    ]
@router.post("/messages/{message_id}/feedback")
async def give_feedback(
    message_id: uuid.UUID,
    body: MessageFeedbackRequest,
    current_user: CurrentUser,
    db: DB,
):
    """Register user feedback for a specific AI message."""
    from app.models.conversation import MessageFeedback
    
    result = await db.execute(
        select(Message).join(Conversation).where(
            Message.id == message_id,
            Conversation.user_id == current_user.id
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    message.feedback = MessageFeedback.LIKE if body.feedback == "like" else MessageFeedback.DISLIKE
    message.feedback_notes = body.notes
    await db.commit()
    return {"status": "ok", "feedback": message.feedback}
