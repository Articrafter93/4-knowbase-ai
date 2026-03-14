"""
Sharing router — invite, accept, revoke and list collection permissions.
"""
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.document import Collection
from app.models.permission import CollectionPermission, CollectionRole

router = APIRouter()


class InviteRequest(BaseModel):
    collection_id: uuid.UUID
    email: Optional[EmailStr] = None
    role: CollectionRole = CollectionRole.VIEWER


class AcceptInviteRequest(BaseModel):
    token: str


# ── Invite ────────────────────────────────────────────────────────────────────

@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def invite_user(body: InviteRequest, current_user: CurrentUser, db: DB):
    """
    Generate an invite token for a collection you own or admin.
    The token can be shared with the invitee via email or link.
    """
    collection = await db.get(Collection, body.collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Check caller is owner or admin of this collection
    is_owner = collection.owner_id == current_user.id
    if not is_owner:
        perm = await db.scalar(
            select(CollectionPermission).where(
                CollectionPermission.collection_id == body.collection_id,
                CollectionPermission.user_id == current_user.id,
                CollectionPermission.role == CollectionRole.ADMIN,
                CollectionPermission.accepted == True,
            )
        )
        if not perm:
            raise HTTPException(status_code=403, detail="Not authorized to invite members")

    token = secrets.token_urlsafe(32)
    invite = CollectionPermission(
        collection_id=body.collection_id,
        user_id=current_user.id,  # placeholder until accepted
        granted_by_id=current_user.id,
        role=body.role,
        invite_token=token,
        invite_email=body.email,
        accepted=False,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return {
        "invite_id": str(invite.id),
        "token": token,
        "role": body.role,
        "collection_id": str(body.collection_id),
        "invite_url": f"/accept-invite?token={token}",
    }


# ── Accept invite ─────────────────────────────────────────────────────────────

@router.post("/accept")
async def accept_invite(body: AcceptInviteRequest, current_user: CurrentUser, db: DB):
    """Accept a collection invite using the token from the invite link."""
    invite = await db.scalar(
        select(CollectionPermission).where(
            CollectionPermission.invite_token == body.token,
            CollectionPermission.accepted == False,
        )
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or already used invite token")

    from datetime import datetime, timezone
    invite.user_id = current_user.id
    invite.accepted = True
    invite.accepted_at = datetime.now(timezone.utc)
    invite.invite_token = None  # consume token
    await db.commit()

    return {"message": "Invite accepted", "collection_id": str(invite.collection_id), "role": invite.role}


# ── List members ──────────────────────────────────────────────────────────────

@router.get("/collections/{collection_id}/members")
async def list_members(collection_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """List members of a collection (owner or admin only)."""
    collection = await db.get(Collection, collection_id)
    if not collection or collection.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.execute(
        select(CollectionPermission).where(
            CollectionPermission.collection_id == collection_id,
            CollectionPermission.accepted == True,
        )
    )
    perms = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "role": p.role,
            "granted_at": p.granted_at,
            "accepted_at": p.accepted_at,
        }
        for p in perms
    ]


# ── Revoke ────────────────────────────────────────────────────────────────────

@router.delete("/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_permission(permission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """Revoke a user's access to a collection."""
    perm = await db.get(CollectionPermission, permission_id)
    if not perm:
        raise HTTPException(status_code=404)
    collection = await db.get(Collection, perm.collection_id)
    if not collection or collection.owner_id != current_user.id:
        raise HTTPException(status_code=403)
    await db.delete(perm)
    await db.commit()


# ── My shared collections ─────────────────────────────────────────────────────

@router.get("/shared-with-me")
async def shared_with_me(current_user: CurrentUser, db: DB):
    """Collections shared with the current user (excluding ones they own)."""
    result = await db.execute(
        select(CollectionPermission).where(
            CollectionPermission.user_id == current_user.id,
            CollectionPermission.accepted == True,
        )
    )
    perms = result.scalars().all()
    return [
        {"collection_id": str(p.collection_id), "role": p.role, "accepted_at": p.accepted_at}
        for p in perms
    ]
