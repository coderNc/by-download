from typing import Optional

from pydantic import BaseModel


class SettingsResponse(BaseModel):
    default_format: str = "mp4"
    default_quality: str = "best"
    max_concurrent_downloads: int = 3
    download_dir: str = ""
    rate_limit: int = 0
    proxy: str = ""
    auto_delete_days: int = 7
    cookie_status: Optional[str] = None
    cookie_expires: Optional[str] = None
    ytdlp_version: str = ""
    ffmpeg_installed: bool = False
    ffmpeg_version: str = ""


class SettingsUpdateRequest(BaseModel):
    default_format: Optional[str] = None
    default_quality: Optional[str] = None
    max_concurrent_downloads: Optional[int] = None
    download_dir: Optional[str] = None
    rate_limit: Optional[int] = None
    proxy: Optional[str] = None
    auto_delete_days: Optional[int] = None


class CookieImportRequest(BaseModel):
    cookie_content: str
    platform: str = "bilibili"


class HealthResponse(BaseModel):
    status: str = "ok"
    ytdlp_version: str = ""
    ffmpeg_installed: bool = False
    ffmpeg_version: str = ""
    active_downloads: int = 0
    queued_downloads: int = 0


class YtdlpUpdateResponse(BaseModel):
    success: bool
    old_version: str = ""
    new_version: str = ""
    message: str = ""
