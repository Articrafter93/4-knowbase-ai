"""
CollectionPermission ORM — collection-level read/write RBAC for multi-user sharing.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class CollectionRole(str, enum.Enum):
    VIEWER = "viewer"    # can search + chat over this collection
    EDITOR = "editor"    # can also add/delete documents
    ADMIN = "admin"      # can also invite/revoke other members


class CollectionPermission(Base):
    """
    Grants a user access to a collection owned by another user.
    The collection owner always has full access (not stored here).
    """
    __tablename__ = "collection_permissions"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    collection_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    granted_by_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    role: CollectionRole = Column(
        Enum(CollectionRole, name="collection_role"),
        nullable=False,
        default=CollectionRole.VIEWER,
    )

    # Invite metadata
    invite_token: str | None = Column(String(128), nullable=True, unique=True, index=True)
    invite_email: str | None = Column(String(255), nullable=True)
    accepted: bool = Column(Boolean, default=False)

    granted_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    accepted_at: datetime | None = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    collection = relationship("Collection", foreign_keys=[collection_id])
    user = relationship("User", foreign_keys=[user_id])
    granted_by = relationship("User", foreign_keys=[granted_by_id])
