from datetime import UTC, datetime, timedelta

import pytest

from app.core import cookie_manager
from app.core.cookie_manager import (
    CookieOnlineVerificationResult,
    inspect_cookie_content,
    parse_cookie_content,
    serialize_cookie_records,
    verify_cookie_file_online,
)
from app.core.config import settings


def _future_timestamp(days: int = 7) -> int:
    return int((datetime.now(UTC) + timedelta(days=days)).timestamp())


def test_parse_cookie_content_roundtrip() -> None:
    content = (
        "# Netscape HTTP Cookie File\n\n"
        ".bilibili.com\tTRUE\t/\tTRUE\t"
        f"{_future_timestamp()}\tSESSDATA\tvalue123\n"
    )

    records = parse_cookie_content(content)
    serialized = serialize_cookie_records(records)
    reparsed = parse_cookie_content(serialized)

    assert len(reparsed) == 1
    assert reparsed[0].domain == ".bilibili.com"
    assert reparsed[0].name == "SESSDATA"
    assert reparsed[0].value == "value123"


def test_inspect_cookie_content_filters_to_platform_domains() -> None:
    content = (
        "# Netscape HTTP Cookie File\n\n"
        ".bilibili.com\tTRUE\t/\tTRUE\t"
        f"{_future_timestamp()}\tSESSDATA\tgood\n"
        ".youtube.com\tTRUE\t/\tTRUE\t"
        f"{_future_timestamp()}\tSID\tignore-me\n"
    )

    inspection, matching, valid = inspect_cookie_content("bilibili", content)

    assert inspection.status == "valid"
    assert inspection.matching_cookie_count == 1
    assert inspection.valid_cookie_count == 1
    assert [record.domain for record in matching] == [".bilibili.com"]
    assert [record.name for record in valid] == ["SESSDATA"]


def test_inspect_cookie_content_marks_expired_records_invalid() -> None:
    expired_timestamp = int((datetime.now(UTC) - timedelta(days=1)).timestamp())
    content = (
        "# Netscape HTTP Cookie File\n\n"
        ".bilibili.com\tTRUE\t/\tTRUE\t"
        f"{expired_timestamp}\tSESSDATA\tstale\n"
    )

    inspection, _, valid = inspect_cookie_content("bilibili", content)

    assert inspection.status == "invalid"
    assert inspection.issue_code == "expired"
    assert inspection.valid_cookie_count == 0
    assert valid == []


@pytest.mark.asyncio
async def test_verify_cookie_file_online_short_circuits_when_missing(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cookie_dir", str(tmp_path))

    result = await verify_cookie_file_online("bilibili")

    assert result.verified is False
    assert result.issue_code == "missing"


@pytest.mark.asyncio
async def test_verify_cookie_file_online_delegates_for_valid_cookie(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "cookie_dir", str(tmp_path))
    cookie_path = tmp_path / "bilibili_cookies.txt"
    cookie_path.write_text(
        "# Netscape HTTP Cookie File\n\n"
        ".bilibili.com\tTRUE\t/\tTRUE\t"
        f"{_future_timestamp()}\tSESSDATA\tvalid\n",
        encoding="utf-8",
    )

    async def fake_verify(platform: str) -> CookieOnlineVerificationResult:
        assert platform == "bilibili"
        return CookieOnlineVerificationResult(
            platform=platform,
            verified=True,
            issue_code=None,
            message="ok",
            checked_at=datetime.now(UTC),
            account_label="tester",
        )

    monkeypatch.setattr(cookie_manager, "_verify_bilibili_cookie", fake_verify)

    result = await verify_cookie_file_online("bilibili")

    assert result.verified is True
    assert result.account_label == "tester"
