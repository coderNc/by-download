from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VideoFormat(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    label: str
    is_audio_only: bool = False


class ParsedVideo(BaseModel):
    url: str
    platform: str
    title: str
    channel: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None
    formats: list[VideoFormat] = []
    subtitles: dict[str, str] = {}
    is_playlist: bool = False
    playlist_id: Optional[str] = None
    playlist_title: Optional[str] = None
    playlist_index: Optional[int] = None


class ParseRequest(BaseModel):
    urls: list[str]


class ParseResponse(BaseModel):
    videos: list[ParsedVideo]
    errors: list[dict] = []


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    channel: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None
    format_id: Optional[str] = None
    format_label: Optional[str] = None
    format_ext: Optional[str] = None
    video_codec: Optional[str] = None
    audio_codec: Optional[str] = None
    quality: Optional[str] = "best"
    extract_audio: bool = False
    audio_format: Optional[str] = "mp3"
    download_subtitles: bool = False
    subtitle_langs: list[str] = []
    playlist_id: Optional[str] = None
    playlist_title: Optional[str] = None
    is_playlist_item: bool = False


class BatchDownloadRequest(BaseModel):
    downloads: list[DownloadRequest]


class TaskResponse(BaseModel):
    id: str
    url: str
    platform: str
    title: Optional[str] = None
    channel: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None
    format_id: Optional[str] = None
    format_label: Optional[str] = None
    quality: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    status: str
    progress: float = 0.0
    speed: Optional[int] = None
    eta: Optional[int] = None
    error_message: Optional[str] = None
    subtitle_path: Optional[str] = None
    is_playlist_item: bool = False
    playlist_id: Optional[str] = None
    playlist_title: Optional[str] = None
    log_text: Optional[str] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    tasks: list[TaskResponse]
    total: int


class TaskUpdateRequest(BaseModel):
    action: str


class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    existing_task: Optional[TaskResponse] = None


class TaskBulkActionRequest(BaseModel):
    action: str


class TaskBulkActionResponse(BaseModel):
    ok: bool = True
    action: str
    affected: int = 0
    task_ids: list[str] = []
