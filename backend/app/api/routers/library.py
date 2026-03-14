"""
Library router — CRUD for documents, collections and tags.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.document import Collection, Document, DocumentStatus, Tag

router = APIRouter()


# ── Collections ───────────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_private: bool = True


@router.get("/collections")
async def list_collections(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Collection).where(Collection.owner_id == current_user.id).order_by(Collection.name)
    )
    cols = result.scalars().all()
    return [{"id": str(c.id), "name": c.name, "description": c.description, "color": c.color, "icon": c.icon, "is_private": c.is_private} for c in cols]


@router.post("/collections", status_code=status.HTTP_201_CREATED)
async def create_collection(body: CollectionCreate, current_user: CurrentUser, db: DB):
    col = Collection(owner_id=current_user.id, **body.model_dump())
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return {"id": str(col.id), "name": col.name}


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: uuid.UUID, current_user: CurrentUser, db: DB):
    col = await db.get(Collection, collection_id)
    if not col or col.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    await db.delete(col)
    await db.commit()


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/documents")
async def list_documents(
    current_user: CurrentUser,
    db: DB,
    collection_id: Optional[uuid.UUID] = None,
    status_filter: Optional[DocumentStatus] = Query(None, alias="status"),
    is_favorite: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    q = select(Document).where(Document.owner_id == current_user.id)
    if collection_id:
        q = q.where(Document.collection_id == collection_id)
    if status_filter:
        q = q.where(Document.status == status_filter)
    else:
        # Hide trashed by default in general listing
        q = q.where(Document.status != DocumentStatus.TRASHED)
        
    if is_favorite is not None:
        q = q.where(Document.is_favorite == is_favorite)
    q = q.order_by(Document.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(q)
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "source_type": d.source_type,
            "status": d.status,
            "is_favorite": d.is_favorite,
            "version": d.version,
            "parent_id": str(d.parent_id) if d.parent_id else None,
            "chunk_count": d.chunk_count,
            "word_count": d.word_count,
            "created_at": d.created_at,
            "indexed_at": d.indexed_at,
        }
        for d in docs
    ]


@router.get("/documents/{document_id}")
async def get_document(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    return {
        "id": str(doc.id),
        "title": doc.title,
        "source_type": doc.source_type,
        "source_url": doc.source_url,
        "status": doc.status,
        "is_favorite": doc.is_favorite,
        "chunk_count": doc.chunk_count,
        "word_count": doc.word_count,
        "doc_metadata": doc.doc_metadata,
        "version": doc.version,
        "created_at": doc.created_at,
        "indexed_at": doc.indexed_at,
    }


@router.patch("/documents/{document_id}/favorite")
async def toggle_favorite(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    doc.is_favorite = not doc.is_favorite
    await db.commit()
    return {"is_favorite": doc.is_favorite}


class DocumentStatusUpdate(BaseModel):
    status: DocumentStatus


@router.patch("/documents/{document_id}/status")
async def update_document_status(document_id: uuid.UUID, body: DocumentStatusUpdate, current_user: CurrentUser, db: DB):
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    doc.status = body.status
    await db.commit()
    return {"status": doc.status}


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """
    Soft-delete a document by moving it to TRASHED.
    If already TRASHED, hard-delete it permanently.
    """
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != current_user.id:
        raise HTTPException(status_code=404)
        
    if doc.status == DocumentStatus.TRASHED:
        # Hard delete
        await db.delete(doc)
    else:
        # Soft delete
        doc.status = DocumentStatus.TRASHED
        
    await db.commit()
