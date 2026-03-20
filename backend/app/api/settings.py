import asyncio
import subprocess
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.core.config import settings
from app.core.cookie_manager import (
    CookieValidationError,
    SUPPORTED_COOKIE_PLATFORMS,
    get_cookie_path,
    inspect_cookie_content,
    inspect_cookie_file,
    serialize_cookie_records,
)
from app.core.history_cleanup import cleanup_completed_tasks
from app.core.ytdlp_wrapper import ytdlp_wrapper
from app.db.database import async_session
from app.db.models import Setting, Task
from app.schemas.settings import (
    CookieImportRequest,
    CookieMutationResponse,
    CookiePlatformStatus,
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


def _build_cookie_platforms() -> dict[str, CookiePlatformStatus]:
    return {
        platform: CookiePlatformStatus.model_validate(asdict(inspect_cookie_file(platform)))
        for platform in SUPPORTED_COOKIE_PLATFORMS
    }


@router.get("/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    db_values = await _load_db_settings()
    ffmpeg_installed, ffmpeg_version = await _get_ffmpeg_info()
    cookie_platforms = _build_cookie_platforms()
    valid_cookie_platforms = [item for item in cookie_platforms.values() if item.status == "valid"]
    cookie_expires = None
    if valid_cookie_platforms:
        expires_candidates = [item.expires_at for item in valid_cookie_platforms if item.expires_at is not None]
        cookie_expires = max(expires_candidates) if expires_candidates else None

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
        "cookie_status": "available" if valid_cookie_platforms else "missing",
        "cookie_expires": cookie_expires,
        "cookie_platforms": cookie_platforms,
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
    if "auto_delete_days" in updates:
        await cleanup_completed_tasks(days=int(updates["auto_delete_days"]))

    return await get_settings()


@router.post("/settings/cookies", response_model=CookieMutationResponse)
async def import_cookies(payload: CookieImportRequest) -> CookieMutationResponse:
    try:
        inspection, _, valid_records = inspect_cookie_content(payload.platform, payload.cookie_content)
    except CookieValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc

    if inspection.status != "valid" or not valid_records:
        raise HTTPException(status_code=400, detail="No valid cookies matched the selected platform")

    cookie_dir = Path(settings.cookie_dir)
    cookie_dir.mkdir(parents=True, exist_ok=True)
    target = get_cookie_path(payload.platform)
    target.write_text(serialize_cookie_records(valid_records), encoding="utf-8")

    platform_status = CookiePlatformStatus.model_validate(asdict(inspect_cookie_file(payload.platform)))
    return CookieMutationResponse(
        status="ok",
        platform=payload.platform.strip().lower(),
        path=str(target),
        platform_status=platform_status,
    )


@router.delete("/settings/cookies/{platform}", response_model=CookieMutationResponse)
async def delete_cookies(platform: str) -> CookieMutationResponse:
    normalized = platform.strip().lower()
    if normalized not in SUPPORTED_COOKIE_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"Unsupported cookie platform: {platform}")

    target = get_cookie_path(normalized)
    if target.exists():
        target.unlink()

    platform_status = CookiePlatformStatus.model_validate(asdict(inspect_cookie_file(normalized)))
    return CookieMutationResponse(status="ok", platform=normalized, platform_status=platform_status)


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
