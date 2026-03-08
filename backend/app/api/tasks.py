import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, func

from app.core.download_manager import download_manager
from app.core.config import settings
from app.db.database import async_session
from app.db.models import Task
from app.schemas.task import TaskResponse, TaskListResponse, TaskUpdateRequest

router = APIRouter(tags=["tasks"])


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    async with async_session() as session:
        query = select(Task)
        count_query = select(func.count(Task.id))

        if status:
            query = query.where(Task.status == status)
            count_query = count_query.where(Task.status == status)

        query = query.order_by(Task.created_at.desc()).limit(limit).offset(offset)

        result = await session.execute(query)
        tasks = result.scalars().all()

        total_result = await session.execute(count_query)
        total = total_result.scalar()

    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str):
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return TaskResponse.model_validate(task)


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, request: TaskUpdateRequest):
    action = request.action
    if action == "pause":
        await download_manager.pause_task(task_id)
    elif action == "resume":
        await download_manager.resume_task(task_id)
    elif action == "retry":
        await download_manager.retry_task(task_id)
    elif action == "cancel":
        await download_manager.cancel_task(task_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    return {"ok": True}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.status == "downloading":
            await download_manager.cancel_task(task_id)

        task_dir = Path(settings.download_dir) / task_id
        if task_dir.exists():
            shutil.rmtree(task_dir, ignore_errors=True)

        await session.delete(task)
        await session.commit()

    return {"ok": True}


@router.get("/tasks/{task_id}/file")
async def download_file(task_id: str):
    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if not task.file_path or not Path(task.file_path).exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            task.file_path,
            media_type="application/octet-stream",
            filename=Path(task.file_path).name,
        )
