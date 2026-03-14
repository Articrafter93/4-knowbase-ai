"""
Personal memory ORM model — stores facts, preferences and context the user wants the AI to remember.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.database import Base


class MemoryType(str, Enum):
    FACT = "fact"
    PREFERENCE = "preference"
    PROJECT = "project"
    PERSON = "person"
    CONTEXT = "context"


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    memory_type: Mapped[MemoryType] = mapped_column(String(20), nullable=False, default=MemoryType.FACT)
    content: Mapped[str] = mapped_column(Text, nullable=False)          # The fact/preference text
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIMENSIONS), nullable=True)
    namespace: Mapped[str] = mapped_column(String(100), default="general", nullable=False, index=True)
    importance: Mapped[int] = mapped_column(default=5)                   # 1–10
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship(back_populates="memories")


from app.models.user import User  # noqa: E402, F401
