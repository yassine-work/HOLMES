"""Celery app and background task definitions."""

from celery import Celery

from app.core.config import get_settings


settings = get_settings()

celery_app = Celery(
    "holmes_worker",
    broker=settings.resolved_celery_broker_url,
    backend=settings.resolved_celery_result_backend,
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
)


@celery_app.task(name="app.worker.background_tasks.process_verification")
def process_verification(task_id: str) -> dict[str, str]:
    """Skeleton background task for verification workflow."""
    return {"task_id": task_id, "status": "queued_for_implementation"}
