from celery import Celery
from app.config import settings

celery_app = Celery(
    "aivora_hc",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_soft_time_limit=300,
    task_time_limit=360,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    result_expires=86400,  # 24 hours
)

# Periodic tasks (beat schedule)
celery_app.conf.beat_schedule = {
    "update-leaderboard-weekly": {
        "task": "app.workers.tasks.update_leaderboard",
        "schedule": 604800,  # 7 days in seconds
    },
    "run-daily-streak-check": {
        "task": "app.workers.tasks.run_daily_streak_check",
        "schedule": 86400,  # 24 hours
    },
}
