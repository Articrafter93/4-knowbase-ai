"""
Smart folders — saved searches that auto-populate based on query + filters.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class SmartFolder(Base):
    """
    A saved search: stores query text + optional filters.
    Each time the user opens it, the search is re-executed on current data.
    """
    __tablename__ = "smart_folders"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name: str = Column(String(200), nullable=False)
    description: Optional[str] = Column(Text, nullable=True)
    icon: Optional[str] = Column(String(10), nullable=True, default="🔍")

    # Saved search parameters
    query: str = Column(Text, nullable=False)             # Natural language query
    filters: dict = Column(JSON, nullable=True)           # e.g. {collection_id, source_types, date_range}
    top_k: int = Column(Integer, nullable=False, default=20)

    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="smart_folders")
