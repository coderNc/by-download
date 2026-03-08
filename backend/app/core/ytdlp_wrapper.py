import asyncio
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from sqlalchemy import select
from yt_dlp.version import __version__ as ytdlp_version

from app.core.config import settings
from app.db.database import async_session
from app.db.models import Setting
from app.schemas.task import ParsedVideo, VideoFormat


ProgressHook = Callable[[dict[str, Any]], None]


class YtdlpWrapper:
    _YOUTUBE_PATTERN = re.compile(r"(?:youtube\.com|youtu\.be)", re.IGNORECASE)
    _BILIBILI_PATTERN = re.compile(r"(?:bilibili\.com|b23\.tv)", re.IGNORECASE)

    @classmethod
    def detect_platform(cls, url: str) -> str:
        if cls._YOUTUBE_PATTERN.search(url):
            return "youtube"
        if cls._BILIBILI_PATTERN.search(url):
            return "bilibili"
        return "unknown"

    @staticmethod
    def _format_filesize(size: int | None) -> str:
        if not size or size <= 0:
            return ""
        units = ["B", "KB", "MB", "GB", "TB"]
        value = float(size)
        idx = 0
        while value >= 1024 and idx < len(units) - 1:
            value /= 1024
            idx += 1
        return f"{value:.1f}{units[idx]}"

    @staticmethod
    def _normalize_duration(value: Any) -> int | None:
        if value is None:
            return None
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(seconds):
            return None
        if seconds < 0:
            return None
        return int(round(seconds))

    @staticmethod
    def _normalize_thumbnail_url(value: Any) -> str | None:
        if not value:
            return None
        url = str(value).strip()
        if not url:
            return None
        if url.startswith("//"):
            return f"https:{url}"
        if url.startswith("http://"):
            return f"https://{url[len('http://'):]}"
        return url

    @classmethod
    def _extract_thumbnail_url(cls, entry: dict[str, Any]) -> str | None:
        direct_thumbnail = cls._normalize_thumbnail_url(entry.get("thumbnail"))
        if direct_thumbnail:
            return direct_thumbnail

        thumbnails = entry.get("thumbnails") or []
        for thumbnail in reversed(thumbnails):
            normalized = cls._normalize_thumbnail_url(thumbnail.get("url"))
            if normalized:
                return normalized
        return None

    @classmethod
    def _build_format_label(cls, fmt: dict[str, Any]) -> str:
        ext = (fmt.get("ext") or "").upper() or "BIN"
        resolution = fmt.get("resolution") or ""
        if not resolution:
            height = fmt.get("height")
            if height:
                resolution = f"{height}p"
        vcodec = fmt.get("vcodec")
        acodec = fmt.get("acodec")
        is_audio_only = vcodec in (None, "none") and acodec not in (None, "none")
        if is_audio_only:
            abr = fmt.get("abr")
            bitrate = f" {int(abr)}kbps" if abr else ""
            size = cls._format_filesize(fmt.get("filesize") or fmt.get("filesize_approx"))
            size_text = f" ({size})" if size else ""
            return f"{ext} Audio{bitrate}{size_text}".strip()
        is_video_only = vcodec not in (None, "none") and acodec in (None, "none")
        scope = "Video" if is_video_only else ""
        size = cls._format_filesize(fmt.get("filesize") or fmt.get("filesize_approx"))
        size_text = f" ({size})" if size else ""
        middle = f" {resolution}" if resolution else ""
        suffix = f" {scope}" if scope else ""
        return f"{ext}{middle}{suffix}{size_text}".strip()

    @staticmethod
    def _collect_subtitles(info: dict[str, Any]) -> dict[str, str]:
        subtitle_map: dict[str, str] = {}
        combined = {}
        subtitles = info.get("subtitles") or {}
        automatic = info.get("automatic_captions") or {}
        combined.update(subtitles)
        for lang, entries in automatic.items():
            combined.setdefault(lang, entries)
        for lang, entries in combined.items():
            if not entries:
                continue
            first = entries[0]
            ext = first.get("ext")
            subtitle_map[lang] = ext or "vtt"
        return subtitle_map

    @classmethod
    def _extract_video_formats(cls, info: dict[str, Any]) -> list[VideoFormat]:
        formats: list[VideoFormat] = []
        seen_format_ids: set[str] = set()
        for fmt in info.get("formats") or []:
            format_id = str(fmt.get("format_id") or "")
            if not format_id or format_id in seen_format_ids:
                continue
            if (fmt.get("ext") or "") == "mhtml":
                continue
            if fmt.get("vcodec") in (None, "none") and fmt.get("acodec") in (None, "none"):
                continue
            seen_format_ids.add(format_id)
            vcodec = fmt.get("vcodec")
            acodec = fmt.get("acodec")
            is_audio_only = vcodec in (None, "none") and acodec not in (None, "none")
            item = VideoFormat(
                format_id=format_id,
                ext=str(fmt.get("ext") or ""),
                resolution=fmt.get("resolution")
                or (f"{fmt.get('height')}p" if fmt.get("height") else None),
                fps=float(fmt["fps"]) if fmt.get("fps") is not None else None,
                vcodec=vcodec,
                acodec=acodec,
                filesize=fmt.get("filesize"),
                filesize_approx=fmt.get("filesize_approx"),
                label=cls._build_format_label(fmt),
                is_audio_only=is_audio_only,
            )
            formats.append(item)
        return formats

    @staticmethod
    def _parse_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
        entries = payload.get("entries")
        if entries:
            return [entry for entry in entries if entry]
        return [payload]

    @staticmethod
    def _cookie_candidates(platform: str) -> list[Path]:
        cookie_dir = Path(settings.cookie_dir)
        if not cookie_dir.exists():
            return []
        base_names = [
            f"{platform}_cookies.txt",
            f"{platform}.txt",
            "cookies.txt",
        ]
        candidates = [cookie_dir / name for name in base_names]
        return [path for path in candidates if path.exists() and path.is_file()]

    async def parse_url(self, url: str) -> list[ParsedVideo]:
        platform = self.detect_platform(url)
        opts: Any = {
            "quiet": True,
            "no_warnings": True,
            "ignoreerrors": True,
            "skip_download": True,
            "noplaylist": False,
        }

        def _extract() -> Any:
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        info = await asyncio.to_thread(_extract)
        if not info:
            return []

        videos: list[ParsedVideo] = []
        entries = self._parse_entries(info)
        is_playlist = bool(info.get("entries"))
        playlist_id = info.get("id") if is_playlist else None
        playlist_title = info.get("title") if is_playlist else None

        for index, entry in enumerate(entries, start=1):
            video_url = entry.get("webpage_url") or entry.get("original_url") or url
            parsed = ParsedVideo(
                url=video_url,
                platform=self.detect_platform(video_url) if platform == "unknown" else platform,
                title=str(entry.get("title") or "Untitled"),
                channel=entry.get("uploader") or entry.get("channel"),
                thumbnail_url=self._extract_thumbnail_url(entry),
                duration=self._normalize_duration(entry.get("duration")),
                formats=self._extract_video_formats(entry),
                subtitles=self._collect_subtitles(entry),
                is_playlist=is_playlist,
                playlist_id=playlist_id,
                playlist_title=playlist_title,
                playlist_index=index if is_playlist else None,
            )
            videos.append(parsed)
        return videos

    async def download(
        self,
        task_id: str,
        url: str,
        format_id: str | None = None,
        quality: str | None = "best",
        extract_audio: bool = False,
        audio_format: str | None = "mp3",
        download_subtitles: bool = False,
        subtitle_langs: list[str] | None = None,
        platform: str | None = None,
        runtime_settings: dict[str, str] | None = None,
        progress_callback: ProgressHook | None = None,
    ) -> str:
        subtitle_langs = subtitle_langs or []
        detected_platform = platform or self.detect_platform(url)
        if runtime_settings is None:
            async with async_session() as session:
                rows = await session.execute(select(Setting))
                runtime_settings = {row.key: row.value for row in rows.scalars().all()}

        download_dir = Path(runtime_settings.get("download_dir", settings.download_dir))
        download_dir.mkdir(parents=True, exist_ok=True)

        ydl_format: str | None = None
        if extract_audio:
            ydl_format = "bestaudio/best"
        elif format_id:
            ydl_format = f"{format_id}+bestaudio/{format_id}"
        elif quality and quality != "best":
            ydl_format = quality

        opts: Any = {
            "quiet": True,
            "no_warnings": True,
            "outtmpl": str(download_dir / f"{task_id}_%(title).180B.%(ext)s"),
            "noplaylist": True,
            "progress_hooks": [progress_callback] if progress_callback else [],
        }

        if ydl_format:
            opts["format"] = ydl_format

        if extract_audio:
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": audio_format or "mp3",
                    "preferredquality": "192",
                }
            ]

        if download_subtitles:
            opts["writesubtitles"] = True
            opts["writeautomaticsub"] = True
            opts["subtitleslangs"] = subtitle_langs or ["all"]
            opts["subtitlesformat"] = "best"

        rate_limit = int(runtime_settings.get("rate_limit", settings.rate_limit))
        proxy = runtime_settings.get("proxy", settings.proxy)
        if rate_limit > 0:
            opts["ratelimit"] = rate_limit * 1024
        if proxy:
            opts["proxy"] = proxy

        cookie_paths = self._cookie_candidates(detected_platform)
        if cookie_paths:
            opts["cookiefile"] = str(cookie_paths[0])

        def _download() -> str:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if info is None:
                    raise RuntimeError("yt-dlp returned no download information")
                requested = info.get("requested_downloads") or []
                if requested and requested[0].get("filepath"):
                    return str(requested[0]["filepath"])
                prepared_name = ydl.prepare_filename(info)
                if extract_audio:
                    target_ext = audio_format or "mp3"
                    candidate = str(Path(prepared_name).with_suffix(f".{target_ext}"))
                    if Path(candidate).exists():
                        return candidate
                return prepared_name

        return await asyncio.to_thread(_download)

    def get_version(self) -> str:
        return ytdlp_version

    async def update(self) -> tuple[str, str]:
        old_version = self.get_version()

        def _run_update() -> None:
            subprocess.run(
                [sys.executable, "-m", "yt_dlp", "-U"],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

        await asyncio.to_thread(_run_update)

        def _reload_version() -> str:
            from importlib import reload
            from yt_dlp import version

            reload(version)
            return version.__version__

        new_version = await asyncio.to_thread(_reload_version)
        return old_version, new_version


ytdlp_wrapper = YtdlpWrapper()
