from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.download import router as download_router
from app.api.history import router as history_router
from app.api.parse import router as parse_router
from app.api.settings import router as settings_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.core.download_manager import DownloadManager
from app.core.history_cleanup import cleanup_completed_tasks
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.download_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.cookie_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.log_dir).mkdir(parents=True, exist_ok=True)

    await init_db()
    await cleanup_completed_tasks()
    manager = DownloadManager(max_concurrent=settings.max_concurrent_downloads)
    app.state.download_manager = manager
    await manager.recover_interrupted()
    await manager.start()
    try:
        yield
    finally:
        await manager.shutdown()


app = FastAPI(title="BY-DOWNLOADER API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.download_dir).mkdir(parents=True, exist_ok=True)
app.mount("/downloads", StaticFiles(directory=settings.download_dir), name="downloads")

app.include_router(parse_router)
app.include_router(download_router)
app.include_router(history_router)
app.include_router(settings_router)
app.include_router(websocket_router)
