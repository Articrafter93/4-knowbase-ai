"""
Chat router — streaming RAG conversation with persistent conversations.
"""
import json
import time
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.conversation import Conversation, Message, MessageFeedback
from app.services.rag.chain import run_rag

router = APIRouter()


class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    conversation_id: Optional[uuid.UUID] = None
    collection_id: Optional[uuid.UUID] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    tags: list[str] = Field(default_factory=list)
    top_k: int = Field(default=10, ge=1, le=30)


class MessageFeedbackRequest(BaseModel):
    feedback: MessageFeedback
    notes: Optional[str] = None


def _json_safe(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    return value


async def _get_or_create_conversation(
    db,
    current_user_id: uuid.UUID,
    body: ChatRequest,
) -> Conversation:
    if body.conversation_id:
        conversation = await db.get(Conversation, body.conversation_id)
        if not conversation or conversation.user_id != current_user_id:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation

    conversation = Conversation(
        user_id=current_user_id,
        collection_id=body.collection_id,
        title=body.query.strip()[:120],
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def _stream_rag_response(
    body: ChatRequest,
    current_user,
    db,
) -> AsyncGenerator[str, None]:
    start = time.monotonic()
    conversation = await _get_or_create_conversation(db, current_user.id, body)
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=body.query.strip(),
    )
    db.add(user_message)
    await db.commit()

    try:
        yield f"data: {json.dumps({'type': 'status', 'content': 'Retrieving relevant sources...'})}\n\n"

        result = await run_rag(
            query=body.query.strip(),
            user_id=str(current_user.id),
            db_session=db,
            collection_id=str(body.collection_id) if body.collection_id else None,
            conversation_id=str(conversation.id),
            tags=body.tags,
            date_from=body.date_from,
            date_to=body.date_to,
            top_k=body.top_k,
        )

        citations = result["citations"]
        yield f"data: {json.dumps({'type': 'citations', 'content': citations})}\n\n"

        answer = result["answer"]
        words = answer.split()
        chunk_buffer: list[str] = []
        for i, word in enumerate(words):
            chunk_buffer.append(word)
            if len(chunk_buffer) >= 5 or i == len(words) - 1:
                chunk_text = " ".join(chunk_buffer) + (" " if i < len(words) - 1 else "")
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk_text})}\n\n"
                chunk_buffer = []

        latency_ms = int((time.monotonic() - start) * 1000)
        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=answer,
            retrieved_chunks=_json_safe(result["retrieved_chunks"]),
            retrieval_backend=result["retrieval_metadata"].get("backend"),
            latency_ms=latency_ms,
            prompt_tokens=len(body.query.split()),
            completion_tokens=len(answer.split()),
        )
        db.add(assistant_message)
        conversation.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(assistant_message)

        yield (
            "data: "
            + json.dumps(
                {
                    "type": "done",
                    "conversation_id": str(conversation.id),
                    "message_id": str(assistant_message.id),
                    "retrieval_metadata": result["retrieval_metadata"],
                    "latency_ms": latency_ms,
                }
            )
            + "\n\n"
        )
    except Exception as exc:
        await db.rollback()
        yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"


@router.post("/")
async def chat(body: ChatRequest, current_user: CurrentUser, db: DB):
    return StreamingResponse(
        _stream_rag_response(body=body, current_user=current_user, db=db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def list_conversations(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    conversations = result.scalars().all()
    return [
        {
            "id": str(conversation.id),
            "title": conversation.title,
            "collection_id": str(conversation.collection_id) if conversation.collection_id else None,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
        }
        for conversation in conversations
    ]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: uuid.UUID, current_user: CurrentUser, db: DB):
    conversation = await db.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.refresh(conversation, attribute_names=["messages"])
    return [
        {
            "id": str(message.id),
            "role": message.role,
            "content": message.content,
            "retrieved_chunks": message.retrieved_chunks,
            "latency_ms": message.latency_ms,
            "feedback": message.feedback,
            "created_at": message.created_at,
        }
        for message in conversation.messages
    ]


@router.post("/messages/{message_id}/feedback")
async def give_feedback(
    message_id: uuid.UUID,
    body: MessageFeedbackRequest,
    current_user: CurrentUser,
    db: DB,
):
    result = await db.execute(
        select(Message)
        .join(Conversation)
        .where(
            Message.id == message_id,
            Conversation.user_id == current_user.id,
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.feedback = body.feedback
    message.feedback_notes = body.notes
    await db.commit()
    return {"status": "ok", "feedback": message.feedback}
