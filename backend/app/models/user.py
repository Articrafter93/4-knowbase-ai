"""
User ORM model.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(String(20), default=UserRole.OWNER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferences: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    collections: Mapped[list["Collection"]] = relationship(back_populates="owner", lazy="select")
    documents: Mapped[list["Document"]] = relationship(back_populates="owner", lazy="select")
    memories: Mapped[list["Memory"]] = relationship(back_populates="user", lazy="select")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user", lazy="select")

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# Avoid circular imports — forward reference imports at bottom
from app.models.document import Collection, Document  # noqa: E402, F401
from app.models.memory import Memory  # noqa: E402, F401
from app.models.conversation import Conversation  # noqa: E402, F401
