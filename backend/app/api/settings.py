import asyncio
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.core.config import settings
from app.core.ytdlp_wrapper import ytdlp_wrapper
from app.db.database import async_session
from app.db.models import Setting, Task
from app.schemas.settings import (
    CookieImportRequest,
    HealthResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    YtdlpUpdateResponse,
)

router = APIRouter(prefix="/api", tags=["settings"])

SETTINGS_FIELDS = {
    "default_format": str,
    "default_quality": str,
    "max_concurrent_downloads": int,
    "download_dir": str,
    "rate_limit": int,
    "proxy": str,
    "auto_delete_days": int,
}


async def _get_ffmpeg_info() -> tuple[bool, str]:
    def _probe() -> tuple[bool, str]:
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
            first_line = result.stdout.splitlines()[0] if result.stdout else ""
            return True, first_line
        except Exception:
            return False, ""

    return await asyncio.to_thread(_probe)


async def _load_db_settings() -> dict[str, str]:
    async with async_session() as session:
        rows = await session.execute(select(Setting))
        pairs = rows.scalars().all()
    return {item.key: item.value for item in pairs}


@router.get("/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    db_values = await _load_db_settings()
    ffmpeg_installed, ffmpeg_version = await _get_ffmpeg_info()

    cookie_dir = Path(settings.cookie_dir)
    cookie_files = list(cookie_dir.glob("*_cookies.txt")) if cookie_dir.exists() else []
    cookie_status = "available" if cookie_files else "missing"

    runtime_values = {
        "default_format": db_values.get("default_format", settings.default_format),
        "default_quality": db_values.get("default_quality", settings.default_quality),
        "max_concurrent_downloads": int(
            db_values.get("max_concurrent_downloads", settings.max_concurrent_downloads)
        ),
        "download_dir": db_values.get("download_dir", settings.download_dir),
        "rate_limit": int(db_values.get("rate_limit", settings.rate_limit)),
        "proxy": db_values.get("proxy", settings.proxy),
        "auto_delete_days": int(db_values.get("auto_delete_days", settings.auto_delete_days)),
        "cookie_status": cookie_status,
        "cookie_expires": None,
        "ytdlp_version": ytdlp_wrapper.get_version(),
        "ffmpeg_installed": ffmpeg_installed,
        "ffmpeg_version": ffmpeg_version,
    }
    return SettingsResponse(**runtime_values)


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdateRequest, request: Request) -> SettingsResponse:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return await get_settings()

    async with async_session() as session:
        for key, value in updates.items():
            if key not in SETTINGS_FIELDS:
                continue
            existing_row = await session.execute(select(Setting).where(Setting.key == key))
            setting_row = existing_row.scalar_one_or_none()
            value_text = str(value)
            if setting_row:
                setting_row.value = value_text
            else:
                session.add(Setting(key=key, value=value_text))
        await session.commit()

    for key, value in updates.items():
        if hasattr(settings, key):
            setattr(settings, key, value)

    manager = getattr(request.app.state, "download_manager", None)
    if manager is not None and "max_concurrent_downloads" in updates:
        await manager.set_max_concurrent(int(updates["max_concurrent_downloads"]))

    return await get_settings()


@router.post("/settings/cookies")
async def import_cookies(payload: CookieImportRequest) -> dict[str, str]:
    platform = payload.platform.strip().lower()
    if not platform:
        raise HTTPException(status_code=400, detail="Invalid platform")

    cookie_dir = Path(settings.cookie_dir)
    cookie_dir.mkdir(parents=True, exist_ok=True)
    target = cookie_dir / f"{platform}_cookies.txt"
    target.write_text(payload.cookie_content, encoding="utf-8")

    return {"status": "ok", "path": str(target)}


@router.delete("/settings/cookies/{platform}")
async def delete_cookies(platform: str) -> dict[str, str]:
    normalized = platform.strip().lower()
    target = Path(settings.cookie_dir) / f"{normalized}_cookies.txt"
    if target.exists():
        target.unlink()
    return {"status": "ok", "platform": normalized}


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    ffmpeg_installed, ffmpeg_version = await _get_ffmpeg_info()
    async with async_session() as session:
        active_row = await session.execute(select(Task).where(Task.status == "downloading"))
        queued_row = await session.execute(select(Task).where(Task.status == "queued"))
        active_count = len(active_row.scalars().all())
        queued_count = len(queued_row.scalars().all())

    return HealthResponse(
        status="ok",
        ytdlp_version=ytdlp_wrapper.get_version(),
        ffmpeg_installed=ffmpeg_installed,
        ffmpeg_version=ffmpeg_version,
        active_downloads=active_count,
        queued_downloads=queued_count,
    )


@router.post("/settings/ytdlp-update", response_model=YtdlpUpdateResponse)
async def update_ytdlp() -> YtdlpUpdateResponse:
    try:
        old_version, new_version = await ytdlp_wrapper.update()
        return YtdlpUpdateResponse(
            success=True,
            old_version=old_version,
            new_version=new_version,
            message="yt-dlp updated successfully",
        )
    except Exception as exc:
        return YtdlpUpdateResponse(
            success=False,
            old_version=ytdlp_wrapper.get_version(),
            new_version=ytdlp_wrapper.get_version(),
            message=str(exc),
        )
