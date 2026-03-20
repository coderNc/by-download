from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, or_, select

from app.core.history_cleanup import cleanup_completed_tasks
from app.db.database import async_session
from app.db.models import Task
from app.schemas.task import TaskListResponse, TaskResponse

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=TaskListResponse)
async def get_history(
    search: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    status: str = Query(default="all"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
) -> TaskListResponse:
    offset = (page - 1) * limit
    conditions = []

    if status != "all":
        conditions.append(Task.status == status)

    if platform and platform != "all":
        if platform == "unknown":
            conditions.append(or_(Task.platform.is_(None), Task.platform == "unknown"))
        else:
            conditions.append(Task.platform == platform)

    if search:
        token = f"%{search}%"
        conditions.append(or_(Task.title.ilike(token), Task.url.ilike(token), Task.channel.ilike(token)))

    async with async_session() as session:
        query = select(Task)
        count_query = select(func.count()).select_from(Task)

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        order_ts = func.coalesce(Task.completed_at, Task.created_at)
        query = query.order_by(order_ts.desc(), Task.created_at.desc()).offset(offset).limit(limit)

        rows = await session.execute(query)
        tasks = rows.scalars().all()
        total_row = await session.execute(count_query)
        total = int(total_row.scalar() or 0)
    return TaskListResponse(tasks=[TaskResponse.model_validate(task) for task in tasks], total=total)


@router.get("/history/stats")
async def get_history_stats() -> dict:
    recent_cutoff = datetime.utcnow() - timedelta(days=7)
    async with async_session() as session:
        total_row = await session.execute(
            select(func.count()).select_from(Task).where(Task.status == "completed")
        )
        size_row = await session.execute(
            select(func.coalesce(func.sum(Task.file_size), 0)).where(Task.status == "completed")
        )
        platform_rows = await session.execute(
            select(Task.platform, func.count())
            .where(Task.status == "completed")
            .group_by(Task.platform)
        )
        recent_row = await session.execute(
            select(func.count())
            .select_from(Task)
            .where(and_(Task.status == "completed", Task.completed_at >= recent_cutoff))
        )

        platform_breakdown = {str(platform or "unknown"): int(count) for platform, count in platform_rows.all()}

        return {
            "total_downloads": int(total_row.scalar() or 0),
            "total_size": int(size_row.scalar() or 0),
            "platform_breakdown": platform_breakdown,
            "recent_count": int(recent_row.scalar() or 0),
        }


@router.get("/history/search", response_model=TaskListResponse)
async def search_history(
    keyword: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
) -> TaskListResponse:
    offset = (page - 1) * limit
    conditions = [Task.status == "completed"]

    if keyword:
        token = f"%{keyword}%"
        conditions.append(or_(Task.title.ilike(token), Task.url.ilike(token)))
    if platform:
        conditions.append(Task.platform == platform)
    if start_date:
        conditions.append(Task.completed_at >= start_date)
    if end_date:
        conditions.append(Task.completed_at <= end_date)

    async with async_session() as session:
        query = select(Task).where(and_(*conditions)).order_by(Task.completed_at.desc()).offset(offset).limit(limit)
        count_query = select(func.count()).select_from(Task).where(and_(*conditions))

        rows = await session.execute(query)
        tasks = rows.scalars().all()
        total_row = await session.execute(count_query)
        total = int(total_row.scalar() or 0)

    return TaskListResponse(tasks=[TaskResponse.model_validate(task) for task in tasks], total=total)


@router.delete("/history/clear")
async def clear_history(days: int = Query(default=30, ge=1)) -> dict[str, int]:
    removed = await cleanup_completed_tasks(days=days)
    return {"removed": removed}
