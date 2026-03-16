"""
Celery ingestion task — runs the full pipeline synchronously in a worker process.
"""
import asyncio
import uuid

import structlog
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.worker.celery_app import celery_app

log = structlog.get_logger()

# Sync engine for Celery (asyncpg not compatible with Celery workers)
_sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
_engine = create_engine(_sync_url, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine)


@celery_app.task(name="app.worker.tasks.ingest_task.run_ingestion_task", bind=True, max_retries=2)
def run_ingestion_task(self, document_id: str, job_id: str):
    """Celery task that runs the async ingestion pipeline via asyncio.run()."""
    log.info("Worker: starting ingestion task", document_id=document_id)
    try:
        import app.models  # noqa: F401
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
        async_engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
        async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

        async def _run():
            async with async_session() as session:
                from app.services.ingestion.pipeline import run_ingestion_pipeline
                await run_ingestion_pipeline(
                    db=session,
                    document_id=uuid.UUID(document_id),
                    job_id=uuid.UUID(job_id),
                )

        asyncio.run(_run())
        log.info("Worker: ingestion task complete", document_id=document_id)
    except Exception as exc:
        log.exception("Worker: ingestion task failed", error=str(exc))
        raise self.retry(exc=exc, countdown=30)
