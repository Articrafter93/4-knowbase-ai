"""
Celery application — Redis broker for background ingestion jobs.
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "knowbase_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks.ingest_task"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.worker.tasks.ingest_task.*": {"queue": "ingestion"},
    },
    task_track_started=True,
)
