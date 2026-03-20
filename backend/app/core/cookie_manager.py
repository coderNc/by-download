from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re

from app.core.config import settings


SUPPORTED_COOKIE_PLATFORMS = ("bilibili", "youtube")

_PLATFORM_COOKIE_DOMAINS: dict[str, tuple[str, ...]] = {
    "bilibili": ("bilibili.com", "b23.tv", "bilivideo.com", "hdslb.com"),
    "youtube": ("youtube.com", "youtu.be", "google.com", "googlevideo.com", "ytimg.com"),
}
_COOKIE_FILE_HEADER = "# Netscape HTTP Cookie File"


class CookieValidationError(ValueError):
    def __init__(self, issue_code: str, message: str):
        super().__init__(message)
        self.issue_code = issue_code
        self.message = message


@dataclass(slots=True)
class CookieRecord:
    domain: str
    include_subdomains: bool
    path: str
    secure: bool
    expires: int | None
    name: str
    value: str
    http_only: bool = False


@dataclass(slots=True)
class CookieInspectionResult:
    platform: str
    status: str
    issue_code: str | None
    cookie_count: int
    matching_cookie_count: int
    valid_cookie_count: int
    expired_cookie_count: int
    domains: list[str]
    expires_at: datetime | None
    last_checked_at: datetime
    has_session_cookie: bool


def _normalize_platform(platform: str) -> str:
    normalized = platform.strip().lower()
    if normalized not in SUPPORTED_COOKIE_PLATFORMS:
        raise CookieValidationError("unsupported_platform", f"Unsupported cookie platform: {platform}")
    return normalized


def get_cookie_path(platform: str) -> Path:
    normalized = _normalize_platform(platform)
    return Path(settings.cookie_dir) / f"{normalized}_cookies.txt"


def _parse_bool_flag(value: str, field_name: str) -> bool:
    normalized = value.strip().upper()
    if normalized == "TRUE":
        return True
    if normalized == "FALSE":
        return False
    raise CookieValidationError("parse_error", f"Invalid {field_name} flag in cookie file")


def _parse_cookie_line(line: str) -> CookieRecord:
    line = line.rstrip("\n")
    parts = line.split("\t")
    if len(parts) != 7:
        parts = re.split(r"\s+", line, maxsplit=6)
    if len(parts) != 7:
        raise CookieValidationError("parse_error", "Cookie file must use Netscape cookie format")

    raw_domain = parts[0].strip()
    http_only = False
    if raw_domain.startswith("#HttpOnly_"):
        raw_domain = raw_domain[len("#HttpOnly_") :]
        http_only = True

    domain = raw_domain.strip().lower()
    if not domain:
        raise CookieValidationError("parse_error", "Cookie domain cannot be empty")

    expires_text = parts[4].strip()
    try:
        expires_raw = int(expires_text)
    except ValueError as exc:
        raise CookieValidationError("parse_error", "Cookie expires field must be an integer timestamp") from exc

    return CookieRecord(
        domain=domain,
        include_subdomains=_parse_bool_flag(parts[1], "include_subdomains"),
        path=parts[2].strip() or "/",
        secure=_parse_bool_flag(parts[3], "secure"),
        expires=None if expires_raw <= 0 else expires_raw,
        name=parts[5].strip(),
        value=parts[6],
        http_only=http_only,
    )


def parse_cookie_content(content: str) -> list[CookieRecord]:
    records: list[CookieRecord] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#") and not line.startswith("#HttpOnly_"):
            continue
        records.append(_parse_cookie_line(raw_line))

    if not records:
        raise CookieValidationError("empty_file", "No cookie records found in the uploaded content")

    return records


def _domain_matches_platform(domain: str, platform: str) -> bool:
    normalized = domain.lstrip(".").lower()
    return any(
        normalized == allowed_domain or normalized.endswith(f".{allowed_domain}")
        for allowed_domain in _PLATFORM_COOKIE_DOMAINS[platform]
    )


def _datetime_from_timestamp(value: int | None) -> datetime | None:
    if value is None:
        return None
    return datetime.utcfromtimestamp(value)


def inspect_cookie_records(platform: str, records: list[CookieRecord]) -> CookieInspectionResult:
    normalized_platform = _normalize_platform(platform)
    checked_at = datetime.utcnow()
    matching_records = [record for record in records if _domain_matches_platform(record.domain, normalized_platform)]

    if not matching_records:
        return CookieInspectionResult(
            platform=normalized_platform,
            status="invalid",
            issue_code="domain_mismatch",
            cookie_count=len(records),
            matching_cookie_count=0,
            valid_cookie_count=0,
            expired_cookie_count=0,
            domains=[],
            expires_at=None,
            last_checked_at=checked_at,
            has_session_cookie=False,
        )

    valid_records: list[CookieRecord] = []
    expired_count = 0
    expires_candidates: list[int] = []
    has_session_cookie = False
    domains = sorted({record.domain.lstrip(".") for record in matching_records})

    now_ts = int(checked_at.timestamp())
    for record in matching_records:
        if record.expires is None:
            has_session_cookie = True
            valid_records.append(record)
            continue
        if record.expires > now_ts:
            valid_records.append(record)
            expires_candidates.append(record.expires)
            continue
        expired_count += 1

    if not valid_records:
        return CookieInspectionResult(
            platform=normalized_platform,
            status="invalid",
            issue_code="expired",
            cookie_count=len(records),
            matching_cookie_count=len(matching_records),
            valid_cookie_count=0,
            expired_cookie_count=expired_count,
            domains=domains,
            expires_at=None,
            last_checked_at=checked_at,
            has_session_cookie=False,
        )

    return CookieInspectionResult(
        platform=normalized_platform,
        status="valid",
        issue_code=None,
        cookie_count=len(records),
        matching_cookie_count=len(matching_records),
        valid_cookie_count=len(valid_records),
        expired_cookie_count=expired_count,
        domains=domains,
        expires_at=_datetime_from_timestamp(max(expires_candidates)) if expires_candidates else None,
        last_checked_at=checked_at,
        has_session_cookie=has_session_cookie,
    )


def inspect_cookie_content(platform: str, content: str) -> tuple[CookieInspectionResult, list[CookieRecord], list[CookieRecord]]:
    normalized_platform = _normalize_platform(platform)
    records = parse_cookie_content(content)
    inspection = inspect_cookie_records(normalized_platform, records)
    matching_records = [record for record in records if _domain_matches_platform(record.domain, normalized_platform)]

    now_ts = int(inspection.last_checked_at.timestamp())
    valid_records = [
        record for record in matching_records if record.expires is None or record.expires > now_ts
    ]
    return inspection, matching_records, valid_records


def inspect_cookie_file(platform: str) -> CookieInspectionResult:
    normalized_platform = _normalize_platform(platform)
    target = get_cookie_path(normalized_platform)
    if not target.exists():
        return CookieInspectionResult(
            platform=normalized_platform,
            status="missing",
            issue_code="missing",
            cookie_count=0,
            matching_cookie_count=0,
            valid_cookie_count=0,
            expired_cookie_count=0,
            domains=[],
            expires_at=None,
            last_checked_at=datetime.utcnow(),
            has_session_cookie=False,
        )

    try:
        content = target.read_text(encoding="utf-8")
        inspection, _, _ = inspect_cookie_content(normalized_platform, content)
        return inspection
    except CookieValidationError as exc:
        return CookieInspectionResult(
            platform=normalized_platform,
            status="invalid",
            issue_code=exc.issue_code,
            cookie_count=0,
            matching_cookie_count=0,
            valid_cookie_count=0,
            expired_cookie_count=0,
            domains=[],
            expires_at=None,
            last_checked_at=datetime.utcnow(),
            has_session_cookie=False,
        )
    except OSError:
        return CookieInspectionResult(
            platform=normalized_platform,
            status="invalid",
            issue_code="read_error",
            cookie_count=0,
            matching_cookie_count=0,
            valid_cookie_count=0,
            expired_cookie_count=0,
            domains=[],
            expires_at=None,
            last_checked_at=datetime.utcnow(),
            has_session_cookie=False,
        )


def serialize_cookie_records(records: list[CookieRecord]) -> str:
    lines = [_COOKIE_FILE_HEADER, ""]
    for record in records:
        domain = f"#HttpOnly_{record.domain}" if record.http_only else record.domain
        expires_text = str(record.expires or 0)
        lines.append(
            "\t".join(
                [
                    domain,
                    "TRUE" if record.include_subdomains else "FALSE",
                    record.path,
                    "TRUE" if record.secure else "FALSE",
                    expires_text,
                    record.name,
                    record.value,
                ]
            )
        )
    lines.append("")
    return "\n".join(lines)
