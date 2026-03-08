from urllib.parse import urljoin, urlparse

import httpx
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from app.core.ytdlp_wrapper import ytdlp_wrapper
from app.db.database import async_session
from app.db.models import Task
from app.schemas.task import DuplicateCheckResponse, ParseRequest, ParseResponse, TaskResponse

router = APIRouter(prefix="/api", tags=["parse"])
_ALLOWED_THUMBNAIL_HOSTS = (
    "hdslb.com",
    "bilibili.com",
    "bilivideo.com",
    "ytimg.com",
    "googleusercontent.com",
    "ggpht.com",
)
_MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024
_MAX_THUMBNAIL_REDIRECTS = 3


class DuplicateCheckRequest(BaseModel):
    url: str


def _validate_thumbnail_url(url: str) -> str:
    candidate = url.strip()
    parsed = urlparse(candidate)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not hostname:
        raise HTTPException(status_code=400, detail="Invalid thumbnail URL")
    if not any(hostname == allowed or hostname.endswith(f".{allowed}") for allowed in _ALLOWED_THUMBNAIL_HOSTS):
        raise HTTPException(status_code=400, detail="Unsupported thumbnail host")
    return candidate


@router.post("/parse", response_model=ParseResponse)
async def parse_urls(payload: ParseRequest) -> ParseResponse:
    if not payload.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    videos = []
    errors: list[dict[str, str]] = []
    for raw_url in payload.urls:
        url = raw_url.strip()
        if not url:
            continue
        try:
            parsed = await ytdlp_wrapper.parse_url(url)
            videos.extend(parsed)
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)})

    return ParseResponse(videos=videos, errors=errors)


@router.post("/check-duplicate", response_model=DuplicateCheckResponse)
async def check_duplicate(payload: DuplicateCheckRequest) -> DuplicateCheckResponse:
    async with async_session() as session:
        result = await session.execute(
            select(Task).where(Task.url == payload.url).order_by(Task.created_at.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return DuplicateCheckResponse(
                is_duplicate=True,
                existing_task=TaskResponse.model_validate(existing),
            )

    return DuplicateCheckResponse(is_duplicate=False)


@router.get("/thumbnail")
async def proxy_thumbnail(url: str = Query(..., min_length=1)) -> Response:
    target_url = _validate_thumbnail_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (BY-DOWNLOADER)",
        "Referer": "https://www.bilibili.com/",
    }
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=20.0) as client:
            current_url = target_url
            for _ in range(_MAX_THUMBNAIL_REDIRECTS + 1):
                upstream = await client.get(current_url, headers=headers)
                if upstream.is_redirect:
                    redirect_target = upstream.headers.get("location")
                    if not redirect_target:
                        raise HTTPException(status_code=502, detail="Thumbnail redirect missing location header")
                    current_url = _validate_thumbnail_url(urljoin(current_url, redirect_target))
                    continue
                upstream.raise_for_status()
                break
            else:
                raise HTTPException(status_code=502, detail="Thumbnail redirected too many times")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch thumbnail: {exc}") from exc

    media_type = upstream.headers.get("content-type", "image/jpeg")
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=502, detail="Thumbnail upstream did not return an image")
    if len(upstream.content) > _MAX_THUMBNAIL_BYTES:
        raise HTTPException(status_code=502, detail="Thumbnail upstream response too large")
    response_headers = {
        "Cache-Control": upstream.headers.get("cache-control", "public, max-age=86400"),
    }
    return Response(content=upstream.content, media_type=media_type, headers=response_headers)
