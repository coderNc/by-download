from datetime import datetime
from typing import Optional

from sqlalchemy import Index, Text, Integer, Float, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    channel: Mapped[Optional[str]] = mapped_column(Text)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text)
    duration: Mapped[Optional[int]] = mapped_column(Integer)
    format_id: Mapped[Optional[str]] = mapped_column(Text)
    format_label: Mapped[Optional[str]] = mapped_column(Text)
    quality: Mapped[Optional[str]] = mapped_column(Text)
    file_path: Mapped[Optional[str]] = mapped_column(Text)
    file_size: Mapped[Optional[int]] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    speed: Mapped[Optional[int]] = mapped_column(Integer)
    eta: Mapped[Optional[int]] = mapped_column(Integer)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    log_text: Mapped[Optional[str]] = mapped_column(Text)
    subtitle_path: Mapped[Optional[str]] = mapped_column(Text)
    is_playlist_item: Mapped[bool] = mapped_column(default=False)
    playlist_id: Mapped[Optional[str]] = mapped_column(Text)
    playlist_title: Mapped[Optional[str]] = mapped_column(Text)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    __table_args__ = (
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_created", "created_at"),
        Index("idx_tasks_url", "url"),
        Index("idx_tasks_playlist", "playlist_id"),
    )


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
