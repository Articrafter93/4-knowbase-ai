"""
Library router — CRUD for documents, collections and source navigation.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DB
from app.models.document import Chunk, Collection, Document, DocumentStatus
from app.models.permission import CollectionPermission
from app.services.documents import serialize_chunk, serialize_document
from app.services.security.trimming import can_read_collection, filter_documents_for_user

router = APIRouter()


class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_private: bool = True


class DocumentStatusUpdate(BaseModel):
    status: DocumentStatus


@router.get("/collections")
async def list_collections(current_user: CurrentUser, db: DB):
    owned = await db.execute(
        select(Collection).where(Collection.owner_id == current_user.id).order_by(Collection.name)
    )
    shared = await db.execute(
        select(Collection)
        .join(CollectionPermission, CollectionPermission.collection_id == Collection.id)
        .where(
            CollectionPermission.user_id == current_user.id,
            CollectionPermission.accepted == True,
        )
        .order_by(Collection.name)
    )

    collections = {}
    for collection in list(owned.scalars().all()) + list(shared.scalars().all()):
        collections[str(collection.id)] = {
            "id": str(collection.id),
            "name": collection.name,
            "description": collection.description,
            "color": collection.color,
            "icon": collection.icon,
            "is_private": collection.is_private,
            "is_shared": collection.owner_id != current_user.id,
        }
    return list(collections.values())


@router.post("/collections", status_code=status.HTTP_201_CREATED)
async def create_collection(body: CollectionCreate, current_user: CurrentUser, db: DB):
    collection = Collection(owner_id=current_user.id, **body.model_dump())
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return {"id": str(collection.id), "name": collection.name}


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: uuid.UUID, current_user: CurrentUser, db: DB):
    collection = await db.get(Collection, collection_id)
    if not collection or collection.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    await db.delete(collection)
    await db.commit()


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
    query = (
        select(Document)
        .options(selectinload(Document.tags))
        .order_by(Document.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    query = await filter_documents_for_user(
        db=db,
        user_id=current_user.id,
        base_query=query,
        include_archived=status_filter == DocumentStatus.ARCHIVED,
        include_trashed=status_filter == DocumentStatus.TRASHED,
    )
    if collection_id:
        query = query.where(Document.collection_id == collection_id)
    if status_filter:
        query = query.where(Document.status == status_filter)
    if is_favorite is not None:
        query = query.where(Document.is_favorite == is_favorite)

    result = await db.execute(query)
    return [serialize_document(document) for document in result.scalars().unique().all()]


@router.get("/documents/{document_id}")
async def get_document(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    query = (
        select(Document)
        .options(selectinload(Document.tags), selectinload(Document.chunks))
        .where(Document.id == document_id)
    )
    query = await filter_documents_for_user(db, current_user.id, query, include_archived=True, include_trashed=True)
    result = await db.execute(query)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404)
    payload = serialize_document(document)
    payload["preview_chunks"] = [serialize_chunk(chunk) for chunk in document.chunks[:6]]
    return payload


@router.get("/documents/{document_id}/chunks")
async def get_document_chunks(
    document_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    highlight_chunk_id: Optional[uuid.UUID] = None,
):
    query = (
        select(Document)
        .options(selectinload(Document.tags), selectinload(Document.chunks))
        .where(Document.id == document_id)
    )
    query = await filter_documents_for_user(db, current_user.id, query, include_archived=True, include_trashed=True)
    result = await db.execute(query)
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404)

    highlighted_chunk = None
    if highlight_chunk_id:
        highlighted_chunk = next((chunk for chunk in document.chunks if chunk.id == highlight_chunk_id), None)

    return {
        "document": serialize_document(document),
        "highlight_chunk_id": str(highlight_chunk_id) if highlight_chunk_id else None,
        "chunks": [
            serialize_chunk(
                chunk,
                highlight=highlighted_chunk.text[:160] if highlighted_chunk and chunk.id == highlighted_chunk.id else None,
            )
            for chunk in sorted(document.chunks, key=lambda item: item.chunk_index)
        ],
    }


@router.patch("/documents/{document_id}/favorite")
async def toggle_favorite(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404)
    if document.owner_id != current_user.id and not (
        document.collection_id and await can_read_collection(db, current_user.id, document.collection_id)
    ):
        raise HTTPException(status_code=403)
    document.is_favorite = not document.is_favorite
    await db.commit()
    return {"is_favorite": document.is_favorite}


@router.patch("/documents/{document_id}/status")
async def update_document_status(
    document_id: uuid.UUID,
    body: DocumentStatusUpdate,
    current_user: CurrentUser,
    db: DB,
):
    document = await db.get(Document, document_id)
    if not document or document.owner_id != current_user.id:
        raise HTTPException(status_code=404)
    document.status = body.status
    await db.commit()
    return {"status": document.status}


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, current_user: CurrentUser, db: DB):
    document = await db.get(Document, document_id)
    if not document or document.owner_id != current_user.id:
        raise HTTPException(status_code=404)

    if document.status == DocumentStatus.TRASHED:
        await db.delete(document)
    else:
        document.status = DocumentStatus.TRASHED
    await db.commit()
