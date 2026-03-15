"""
Smart folders router — CRUD for saved searches + execute endpoint.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.smart_folder import SmartFolder
from app.services.embeddings.provider import embed_query
from app.services.retrieval.hybrid import retrieve_hybrid
from app.services.security.trimming import get_accessible_collection_ids

router = APIRouter()


class SmartFolderCreate(BaseModel):
    name: str
    query: str
    description: Optional[str] = None
    icon: str = "🔍"
    filters: Optional[dict] = None
    top_k: int = 20


class SmartFolderUpdate(BaseModel):
    name: Optional[str] = None
    query: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    filters: Optional[dict] = None


@router.get("/")
async def list_smart_folders(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(SmartFolder)
        .where(SmartFolder.user_id == current_user.id)
        .order_by(SmartFolder.created_at.desc())
    )
    folders = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "description": f.description,
            "icon": f.icon,
            "query": f.query,
            "filters": f.filters,
            "top_k": f.top_k,
            "created_at": f.created_at,
        }
        for f in folders
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_smart_folder(body: SmartFolderCreate, current_user: CurrentUser, db: DB):
    folder = SmartFolder(user_id=current_user.id, **body.model_dump())
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return {"id": str(folder.id), "name": folder.name}


@router.patch("/{folder_id}")
async def update_smart_folder(folder_id: uuid.UUID, body: SmartFolderUpdate, current_user: CurrentUser, db: DB):
    folder = await db.get(SmartFolder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=404)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(folder, field, val)
    await db.commit()
    return {"id": str(folder.id), "name": folder.name}


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_smart_folder(folder_id: uuid.UUID, current_user: CurrentUser, db: DB):
    folder = await db.get(SmartFolder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=404)
    await db.delete(folder)
    await db.commit()


@router.post("/{folder_id}/execute")
async def execute_smart_folder(folder_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """
    Re-run the saved search and return fresh results.
    This is the core of the smart folder concept: always up-to-date.
    """
    folder = await db.get(SmartFolder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=404)

    filters = folder.filters or {}
    collection_id = None
    if "collection_id" in filters:
        try:
            collection_id = uuid.UUID(filters["collection_id"])
        except (ValueError, TypeError):
            pass

    embedding = await embed_query(folder.query)
    accessible_collection_ids = await get_accessible_collection_ids(db, current_user.id)
    results = await retrieve_hybrid(
        db=db,
        query_embedding=embedding,
        user_id=current_user.id,
        accessible_collection_ids=accessible_collection_ids,
        top_k=folder.top_k,
        collection_id=collection_id,
    )

    return {
        "folder_id": str(folder.id),
        "query": folder.query,
        "result_count": len(results),
        "results": [
            {
                "id": str(r.get("id", "")),
                "document_id": str(r.get("document_id", "")),
                "doc_title": r.get("doc_title", ""),
                "fragment": (r.get("text") or r.get("fragment", ""))[:300],
                "score": r.get("score", 0),
                "page_number": r.get("page_number"),
                "source_type": r.get("source_type"),
            }
            for r in results
        ],
    }
