import asyncio
import json
import os
from datetime import datetime
from typing import Any

from sqlalchemy import func, select

from app.api.websocket import connection_manager
from app.core.ytdlp_wrapper import ytdlp_wrapper
from app.core.history_cleanup import cleanup_completed_tasks
from app.db.database import async_session
from app.db.models import Setting, Task
from app.schemas.task import DownloadRequest


class DownloadManager:
    def __init__(self, max_concurrent: int):
        self.semaphore = asyncio.Semaphore(max(1, max_concurrent))
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.active_tasks: dict[str, asyncio.Task[None]] = {}
        self.paused_tasks: set[str] = set()
        self._request_cache: dict[str, DownloadRequest] = {}
        self._download_started_at: dict[str, datetime] = {}
        self._worker_task: asyncio.Task[None] | None = None
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

    async def start(self) -> None:
        if self._worker_task and not self._worker_task.done():
            return
        self._running = True
        self._loop = asyncio.get_running_loop()
        self._worker_task = asyncio.create_task(self._queue_loop())

    async def shutdown(self) -> None:
        self._running = False
        for task_id in list(self.active_tasks.keys()):
            await self.cancel_task(task_id)
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    async def recover_interrupted(self) -> None:
        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.status.in_(["downloading", "queued"])))
            recoverable = result.scalars().all()
            queued_ids: list[str] = []
            for task in recoverable:
                if task.status == "downloading":
                    task.status = "queued"
                    task.progress = 0.0
                    task.speed = None
                    task.eta = None
                    self._append_log(task, "Recovered from previous interrupted session")
                queued_ids.append(task.id)
            await session.commit()
        for task_id in queued_ids:
            await self.queue.put(task_id)
        await cleanup_completed_tasks()
        await self._broadcast_queue_update()

    async def set_max_concurrent(self, max_concurrent: int) -> None:
        self.semaphore = asyncio.Semaphore(max(1, max_concurrent))

    async def add_task(self, task_id: str, download_request: DownloadRequest) -> None:
        self._request_cache[task_id] = download_request
        now = datetime.utcnow()
        async with async_session() as session:
            task = Task(
                id=task_id,
                url=str(download_request.url),
                platform=ytdlp_wrapper.detect_platform(download_request.url),
                title=download_request.title,
                channel=download_request.channel,
                thumbnail_url=download_request.thumbnail_url,
                duration=download_request.duration,
                format_id=download_request.format_id,
                format_label=download_request.format_label,
                quality=download_request.quality,
                status="queued",
                progress=0.0,
                is_playlist_item=download_request.is_playlist_item,
                playlist_id=download_request.playlist_id,
                playlist_title=download_request.playlist_title,
                metadata_json=json.dumps(
                    {
                        "extract_audio": download_request.extract_audio,
                        "audio_format": download_request.audio_format,
                        "download_subtitles": download_request.download_subtitles,
                        "subtitle_langs": download_request.subtitle_langs,
                    }
                ),
                created_at=now,
            )
            self._append_log(task, "Task queued")
            session.add(task)
            await session.commit()
        await self.queue.put(task_id)
        await connection_manager.broadcast(
            {
                "type": "status_change",
                "task_id": task_id,
                "status": "queued",
                "title": download_request.title,
                "url": str(download_request.url),
                "platform": ytdlp_wrapper.detect_platform(download_request.url),
                "log_text": task.log_text,
                "created_at": now.isoformat(),
            }
        )
        await self._broadcast_queue_update()

    async def cancel_task(self, task_id: str) -> None:
        running = self.active_tasks.get(task_id)
        if running and not running.done():
            running.cancel()
        self.paused_tasks.discard(task_id)
        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                return
            task.status = "cancelled"
            task.error_message = "Cancelled by user"
            task.completed_at = datetime.utcnow()
            task.speed = None
            task.eta = None
            self._append_log(task, "Task cancelled")
            await session.commit()
        await connection_manager.broadcast(
            {
                "type": "status_change",
                "task_id": task_id,
                "status": "cancelled",
                "error_message": "Cancelled by user",
                "log_text": task.log_text if task else None,
            }
        )
        await self._broadcast_queue_update()

    async def pause_task(self, task_id: str) -> None:
        self.paused_tasks.add(task_id)
        running = self.active_tasks.get(task_id)
        if running and not running.done():
            running.cancel()
        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                return
            task.status = "paused"
            task.speed = None
            task.eta = None
            self._append_log(task, "Task paused")
            await session.commit()
        await connection_manager.broadcast(
            {
                "type": "status_change",
                "task_id": task_id,
                "status": "paused",
                "log_text": task.log_text if task else None,
            }
        )
        await self._broadcast_queue_update()

    async def resume_task(self, task_id: str) -> None:
        self.paused_tasks.discard(task_id)
        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                return
            task.status = "queued"
            task.error_message = None
            self._append_log(task, "Task resumed")
            await session.commit()
        await self.queue.put(task_id)
        await connection_manager.broadcast(
            {
                "type": "status_change",
                "task_id": task_id,
                "status": "queued",
                "log_text": task.log_text if task else None,
            }
        )
        await self._broadcast_queue_update()

    async def retry_task(self, task_id: str) -> None:
        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                return
            task.status = "queued"
            task.progress = 0.0
            task.speed = None
            task.eta = None
            task.error_message = None
            task.file_path = None
            task.file_size = None
            task.completed_at = None
            self._append_log(task, "Task re-queued for retry")
            await session.commit()
        await self.queue.put(task_id)
        await connection_manager.broadcast(
            {
                "type": "status_change",
                "task_id": task_id,
                "status": "queued",
                "log_text": task.log_text if task else None,
            }
        )
        await self._broadcast_queue_update()

    async def _queue_loop(self) -> None:
        while self._running:
            task_id = await self.queue.get()
            if task_id in self.paused_tasks:
                await self.queue.put(task_id)
                self.queue.task_done()
                await asyncio.sleep(0.1)
                continue

            execution = asyncio.create_task(self._execute_download(task_id))
            self.active_tasks[task_id] = execution

            def _cleanup(_: asyncio.Task[None], item_id: str = task_id) -> None:
                self.active_tasks.pop(item_id, None)
                self.queue.task_done()

            execution.add_done_callback(_cleanup)
            await self._broadcast_queue_update()

    async def _execute_download(self, task_id: str) -> None:
        async with self.semaphore:
            self._download_started_at[task_id] = datetime.utcnow()
            request_data: DownloadRequest | None = self._request_cache.get(task_id)
            task_record: Task | None = None

            async with async_session() as session:
                result = await session.execute(select(Task).where(Task.id == task_id))
                task_record = result.scalar_one_or_none()
                if not task_record:
                    return

                if task_record.status in {"cancelled", "paused"}:
                    return

                metadata: dict[str, Any] = {}
                if task_record.metadata_json:
                    try:
                        metadata = json.loads(task_record.metadata_json)
                    except json.JSONDecodeError:
                        metadata = {}

                if request_data is None:
                    request_data = DownloadRequest(
                        url=task_record.url,
                        title=task_record.title,
                        channel=task_record.channel,
                        thumbnail_url=task_record.thumbnail_url,
                        duration=task_record.duration,
                        format_id=task_record.format_id,
                        format_label=task_record.format_label,
                        quality=task_record.quality,
                        extract_audio=bool(metadata.get("extract_audio", False)),
                        audio_format=metadata.get("audio_format") or "mp3",
                        download_subtitles=bool(metadata.get("download_subtitles", False)),
                        subtitle_langs=list(metadata.get("subtitle_langs") or []),
                        playlist_id=task_record.playlist_id,
                        playlist_title=task_record.playlist_title,
                        is_playlist_item=task_record.is_playlist_item,
                    )

                task_record.status = "downloading"
                task_record.started_at = datetime.utcnow()
                task_record.error_message = None
                task_record.speed = None
                task_record.eta = None
                self._append_log(task_record, "Download started")
                await session.commit()

            await connection_manager.broadcast(
                {
                    "type": "status_change",
                    "task_id": task_id,
                    "status": "downloading",
                    "started_at": task_record.started_at.isoformat() if task_record and task_record.started_at else None,
                    "log_text": task_record.log_text if task_record else None,
                }
            )
            await self._broadcast_queue_update()

            if self._loop is None:
                self._loop = asyncio.get_running_loop()

            async with async_session() as session:
                settings_rows = await session.execute(select(Setting))
                runtime_settings = {row.key: row.value for row in settings_rows.scalars().all()}

            def _sync_progress_hook(data: dict[str, Any]) -> None:
                if self._loop is None:
                    return
                asyncio.run_coroutine_threadsafe(self._progress_callback(task_id, data), self._loop)

            try:
                download_result = await ytdlp_wrapper.download(
                    task_id=task_id,
                    url=request_data.url,
                    format_id=request_data.format_id,
                    quality=request_data.quality,
                    extract_audio=request_data.extract_audio,
                    audio_format=request_data.audio_format,
                    download_subtitles=request_data.download_subtitles,
                    subtitle_langs=request_data.subtitle_langs,
                    platform=ytdlp_wrapper.detect_platform(request_data.url),
                    runtime_settings=runtime_settings,
                    progress_callback=_sync_progress_hook,
                )
                output_path = download_result.output_path
                file_size = os.path.getsize(output_path) if os.path.exists(output_path) else None
                completed_at = datetime.utcnow()

                async with async_session() as session:
                    result = await session.execute(select(Task).where(Task.id == task_id))
                    task_record = result.scalar_one_or_none()
                    if task_record:
                        task_record.file_path = output_path
                        task_record.subtitle_path = download_result.subtitle_path
                        task_record.file_size = file_size
                        task_record.status = "completed"
                        task_record.progress = 100.0
                        task_record.speed = None
                        task_record.eta = None
                        task_record.completed_at = completed_at
                        self._append_log(task_record, "Download completed")
                        await session.commit()

                await connection_manager.broadcast(
                    {
                        "type": "status_change",
                        "task_id": task_id,
                        "status": "completed",
                        "file_path": output_path,
                        "subtitle_path": download_result.subtitle_path,
                        "completed_at": completed_at.isoformat(),
                        "progress": 100.0,
                        "log_text": task_record.log_text if task_record else None,
                    }
                )
                await cleanup_completed_tasks()
            except asyncio.CancelledError:
                async with async_session() as session:
                    result = await session.execute(select(Task).where(Task.id == task_id))
                    task_record = result.scalar_one_or_none()
                    if task_record:
                        if task_record.status != "paused":
                            task_record.status = "cancelled"
                            task_record.error_message = "Cancelled by user"
                        task_record.speed = None
                        task_record.eta = None
                        task_record.completed_at = datetime.utcnow()
                        self._append_log(task_record, "Download cancelled")
                        await session.commit()
                await connection_manager.broadcast(
                    {
                        "type": "status_change",
                        "task_id": task_id,
                        "status": "cancelled",
                        "error_message": "Cancelled by user",
                        "log_text": task_record.log_text if task_record else None,
                    }
                )
                raise
            except Exception as exc:
                async with async_session() as session:
                    result = await session.execute(select(Task).where(Task.id == task_id))
                    task_record = result.scalar_one_or_none()
                    if task_record:
                        task_record.status = "failed"
                        task_record.error_message = str(exc)
                        task_record.speed = None
                        task_record.eta = None
                        task_record.completed_at = datetime.utcnow()
                        self._append_log(task_record, f"Download failed: {exc}")
                        await session.commit()
                await connection_manager.broadcast(
                    {
                        "type": "status_change",
                        "task_id": task_id,
                        "status": "failed",
                        "error_message": str(exc),
                        "log_text": task_record.log_text if task_record else None,
                    }
                )
            finally:
                self._request_cache.pop(task_id, None)
                self._download_started_at.pop(task_id, None)
                await self._broadcast_queue_update()

    async def _progress_callback(self, task_id: str, data: dict[str, Any]) -> None:
        hook_status = data.get("status")
        downloaded_bytes = data.get("downloaded_bytes") or 0
        total_bytes = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
        speed = data.get("speed")
        eta = data.get("eta")

        progress = 0.0
        if total_bytes:
            progress = min(100.0, (downloaded_bytes / total_bytes) * 100)
        elif hook_status == "finished":
            progress = 100.0

        started = self._download_started_at.get(task_id)
        if speed is None and started and downloaded_bytes:
            elapsed = (datetime.utcnow() - started).total_seconds()
            if elapsed > 0:
                speed = downloaded_bytes / elapsed

        speed_int = int(speed) if speed else None
        eta_int = int(eta) if eta else None

        async with async_session() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                return
            if task.status in {"cancelled", "paused", "failed", "completed"}:
                return

            task.progress = progress
            task.speed = speed_int
            task.eta = eta_int
            self._append_log(
                task,
                f"Progress {progress:.1f}% | speed={speed_int or 0}B/s | eta={eta_int or 0}s",
            )
            await session.commit()

        await connection_manager.broadcast(
            {
                "type": "progress",
                "task_id": task_id,
                "progress": progress,
                "speed": speed_int,
                "eta": eta_int,
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes or None,
            }
        )

    async def _broadcast_queue_update(self) -> None:
        async with async_session() as session:
            queued_result = await session.execute(
                select(func.count()).select_from(Task).where(Task.status == "queued")
            )
            queued_count = int(queued_result.scalar() or 0)

            downloading_result = await session.execute(
                select(func.count()).select_from(Task).where(Task.status == "downloading")
            )
            downloading_count = int(downloading_result.scalar() or 0)

        await connection_manager.broadcast(
            {
                "type": "queue_update",
                "queued": queued_count,
                "active": downloading_count,
            }
        )

    @staticmethod
    def _append_log(task: Task, line: str) -> None:
        timestamp = datetime.utcnow().isoformat(timespec="seconds")
        current = task.log_text or ""
        appended = f"[{timestamp}] {line}"
        task.log_text = f"{current}\n{appended}".strip()
