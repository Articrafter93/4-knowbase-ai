"""
Security trimming — row-level access control for all retrieval and document queries.
Enforces collection-level permissions for multi-user sharing (Phase 3).
"""
import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Collection, Document, DocumentStatus
from app.models.permission import CollectionPermission, CollectionRole


async def get_accessible_collection_ids(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[uuid.UUID]:
    """
    Returns collection IDs the user can access:
    - Collections they own
    - Collections shared with them (accepted invite)
    """
    # Owned collections
    owned = await db.execute(
        select(Collection.id).where(Collection.owner_id == user_id)
    )
    owned_ids = {row[0] for row in owned.all()}

    # Shared collections
    shared = await db.execute(
        select(CollectionPermission.collection_id).where(
            CollectionPermission.user_id == user_id,
            CollectionPermission.accepted == True,
        )
    )
    shared_ids = {row[0] for row in shared.all()}

    return list(owned_ids | shared_ids)


async def can_read_collection(
    db: AsyncSession,
    user_id: uuid.UUID,
    collection_id: uuid.UUID,
) -> bool:
    """Check if user can read from this collection (owner or any accepted invite)."""
    collection = await db.get(Collection, collection_id)
    if not collection:
        return False
    if collection.owner_id == user_id:
        return True
    perm = await db.scalar(
        select(CollectionPermission).where(
            CollectionPermission.collection_id == collection_id,
            CollectionPermission.user_id == user_id,
            CollectionPermission.accepted == True,
        )
    )
    return perm is not None


async def can_write_collection(
    db: AsyncSession,
    user_id: uuid.UUID,
    collection_id: uuid.UUID,
) -> bool:
    """Check if user can write to this collection (owner or editor/admin)."""
    collection = await db.get(Collection, collection_id)
    if not collection:
        return False
    if collection.owner_id == user_id:
        return True
    perm = await db.scalar(
        select(CollectionPermission).where(
            CollectionPermission.collection_id == collection_id,
            CollectionPermission.user_id == user_id,
            CollectionPermission.role.in_([CollectionRole.EDITOR, CollectionRole.ADMIN]),
            CollectionPermission.accepted == True,
        )
    )
    return perm is not None


async def filter_documents_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    base_query,
    include_archived: bool = False,
    include_trashed: bool = False,
):
    """
    Filter a document query to only include documents the user can access:
    - Own documents (any collection or no collection)
    - Documents in collections shared with them

    By default, also filters out TRASHED and ARCHIVED documents (Phase 4).
    """
    accessible_ids = await get_accessible_collection_ids(db, user_id)
    
    query = base_query.where(
        or_(
            Document.owner_id == user_id,
            Document.collection_id.in_(accessible_ids),
        )
    )

    if not include_trashed:
        query = query.where(Document.status != DocumentStatus.TRASHED)
    if not include_archived:
        query = query.where(Document.status != DocumentStatus.ARCHIVED)

    return query
