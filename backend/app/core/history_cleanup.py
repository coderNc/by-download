from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import and_, select

from app.core.config import settings
from app.db.database import async_session
from app.db.models import Setting, Task


async def _resolve_auto_delete_days() -> int:
    async with async_session() as session:
        result = await session.execute(select(Setting).where(Setting.key == "auto_delete_days"))
        setting = result.scalar_one_or_none()

    if setting is None:
        return settings.auto_delete_days

    try:
        return int(setting.value)
    except (TypeError, ValueError):
        return settings.auto_delete_days


def _unlink_if_exists(path_value: str | None) -> None:
    if not path_value:
        return

    try:
        Path(path_value).unlink(missing_ok=True)
    except OSError:
        pass


async def cleanup_completed_tasks(days: int | None = None) -> int:
    resolved_days = await _resolve_auto_delete_days() if days is None else days
    if resolved_days <= 0:
        return 0

    cutoff = datetime.utcnow() - timedelta(days=resolved_days)

    async with async_session() as session:
        rows = await session.execute(
            select(Task).where(
                and_(
                    Task.status == "completed",
                    Task.completed_at.is_not(None),
                    Task.completed_at < cutoff,
                )
            )
        )
        stale_tasks = rows.scalars().all()

        for task in stale_tasks:
            _unlink_if_exists(task.file_path)
            _unlink_if_exists(task.subtitle_path)
            await session.delete(task)

        await session.commit()

    return len(stale_tasks)
