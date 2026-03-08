import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.core.download_manager import DownloadManager
from app.db.database import async_session
from app.db.models import Task
from app.schemas.task import (
    BatchDownloadRequest,
    DownloadRequest,
    TaskListResponse,
    TaskResponse,
    TaskUpdateRequest,
)

router = APIRouter(prefix="/api", tags=["download"])


def _get_download_manager(request: Request) -> DownloadManager:
    manager = getattr(request.app.state, "download_manager", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Download manager not initialized")
    return manager
@router.post("/download", response_model=TaskResponse)
async def create_download(payload: DownloadRequest, request: Request) -> TaskResponse:
    task_id = str(uuid4())
    manager = _get_download_manager(request)
    await manager.add_task(task_id=task_id, download_request=payload)

    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=500, detail="Failed to create task")
        return TaskResponse.model_validate(task)


@router.post("/download/batch", response_model=TaskListResponse)
async def create_batch_download(payload: BatchDownloadRequest, request: Request) -> TaskListResponse:
    if not payload.downloads:
        raise HTTPException(status_code=400, detail="No download items provided")

    manager = _get_download_manager(request)
    task_ids: list[str] = []
    for item in payload.downloads:
        task_id = str(uuid4())
        task_ids.append(task_id)
        await manager.add_task(task_id=task_id, download_request=item)

    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id.in_(task_ids)).order_by(Task.created_at.desc()))
        tasks = result.scalars().all()
        return TaskListResponse(tasks=[TaskResponse.model_validate(task) for task in tasks], total=len(tasks))


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
) -> TaskListResponse:
    offset = (page - 1) * limit
    async with async_session() as session:
        query = select(Task)
        count_query = select(func.count()).select_from(Task)

        if status:
            query = query.where(Task.status == status)
            count_query = count_query.where(Task.status == status)

        query = query.order_by(Task.created_at.desc()).offset(offset).limit(limit)

        rows = await session.execute(query)
        tasks = rows.scalars().all()
        total_row = await session.execute(count_query)
        total = int(total_row.scalar() or 0)

    return TaskListResponse(tasks=[TaskResponse.model_validate(task) for task in tasks], total=total)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str) -> TaskResponse:
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return TaskResponse.model_validate(task)


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request) -> dict[str, Any]:
    manager = _get_download_manager(request)
    await manager.cancel_task(task_id)

    file_path: str | None = None
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        file_path = task.file_path
        await session.delete(task)
        await session.commit()

    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    return {"ok": True, "task_id": task_id}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdateRequest, request: Request) -> dict[str, Any]:
    manager = _get_download_manager(request)
    action = payload.action.strip().lower()
    if action == "pause":
        await manager.pause_task(task_id)
    elif action == "resume":
        await manager.resume_task(task_id)
    elif action == "retry":
        await manager.retry_task(task_id)
    elif action == "cancel":
        await manager.cancel_task(task_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported action: {payload.action}")

    return {"ok": True, "task_id": task_id, "action": action}


@router.get("/tasks/{task_id}/file")
async def get_downloaded_file(task_id: str) -> FileResponse:
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if not task.file_path:
            raise HTTPException(status_code=404, detail="File path unavailable")
        path = Path(task.file_path)
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail="Downloaded file not found")

    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=path.name,
    )


@router.get("/tasks/{task_id}/log")
async def get_task_log(task_id: str) -> dict[str, str]:
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"task_id": task_id, "log_text": task.log_text or ""}
