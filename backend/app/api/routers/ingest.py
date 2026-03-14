"""
Ingest router — upload files, submit URLs, check job status.
"""
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DB
from app.models.document import Document, DocumentStatus, IngestionJob, SourceType

router = APIRouter()


class URLIngestRequest(BaseModel):
    url: str
    title: Optional[str] = None
    collection_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    tags: Optional[list[str]] = []


class IngestResponse(BaseModel):
    document_id: str
    job_id: str
    status: str
    message: str


async def _enqueue_job(doc_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Submit ingestion to Celery worker."""
    from app.worker.tasks.ingest_task import run_ingestion_task
    run_ingestion_task.delay(str(doc_id), str(job_id))


@router.post("/file", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_file(
    current_user: CurrentUser,
    db: DB,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    collection_id: Optional[str] = Form(None),
    parent_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
):
    """Upload a file for ingestion (PDF, DOCX, TXT, MD, image)."""
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    file_content = await file.read()
    if len(file_content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB} MB limit")

    # Save to uploads dir
    upload_dir = Path(settings.UPLOAD_DIR) / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    suffix = Path(file.filename or "file.bin").suffix.lower()
    file_path = upload_dir / f"{file_id}{suffix}"
    file_path.write_bytes(file_content)

    # Detect source type
    ext_map = {".pdf": SourceType.PDF, ".docx": SourceType.DOCX, ".txt": SourceType.TXT,
               ".md": SourceType.MARKDOWN, ".markdown": SourceType.MARKDOWN,
               ".png": SourceType.IMAGE, ".jpg": SourceType.IMAGE, ".jpeg": SourceType.IMAGE}
    source_type = ext_map.get(suffix, SourceType.TXT)

    col_id = uuid.UUID(collection_id) if collection_id else None
    ptr_id = uuid.UUID(parent_id) if parent_id else None
    version = 1
    
    if ptr_id:
        parent_doc = await db.get(Document, ptr_id)
        if parent_doc:
            version = parent_doc.version + 1

    doc = Document(
        owner_id=current_user.id,
        collection_id=col_id,
        parent_id=ptr_id,
        version=version,
        title=title or file.filename or "Untitled",
        source_type=source_type,
        file_path=str(file_path),
        file_size_bytes=len(file_content),
        mime_type=file.content_type,
        status=DocumentStatus.ACTIVE,
    )
    db.add(doc)
    await db.flush()

    job = IngestionJob(document_id=doc.id, owner_id=current_user.id)
    db.add(job)
    await db.commit()
    await db.refresh(doc)
    await db.refresh(job)

    # Enqueue background job
    background_tasks.add_task(_enqueue_job, doc.id, job.id)

    return IngestResponse(
        document_id=str(doc.id),
        job_id=str(job.id),
        status="queued",
        message="File received and queued for ingestion",
    )


@router.post("/url", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_url(
    body: URLIngestRequest,
    current_user: CurrentUser,
    db: DB,
    background_tasks: BackgroundTasks,
):
    """Submit a URL for ingestion."""
    doc = Document(
        owner_id=current_user.id,
        collection_id=body.collection_id,
        parent_id=body.parent_id,
        title=body.title or body.url[:500],
        source_type=SourceType.URL,
        source_url=body.url,
        status=DocumentStatus.ACTIVE,
    )
    db.add(doc)
    await db.flush()
    job = IngestionJob(document_id=doc.id, owner_id=current_user.id)
    db.add(job)
    await db.commit()
    await db.refresh(doc)
    await db.refresh(job)

    background_tasks.add_task(_enqueue_job, doc.id, job.id)

    return IngestResponse(
        document_id=str(doc.id),
        job_id=str(job.id),
        status="queued",
        message="URL queued for ingestion",
    )


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: uuid.UUID, current_user: CurrentUser, db: DB):
    """Poll ingestion job status and progress."""
    job = await db.get(IngestionJob, job_id)
    if not job or job.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": str(job.id),
        "document_id": str(job.document_id),
        "status": job.status,
        "progress": job.progress,
        "error_message": job.error_message,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }
