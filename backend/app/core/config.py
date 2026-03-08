from pathlib import Path

from pydantic_settings import BaseSettings

_BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    download_dir: str = str(_BASE_DIR / "downloads")
    cookie_dir: str = str(_BASE_DIR / "cookies")
    log_dir: str = str(_BASE_DIR / "logs")
    database_url: str = "sqlite+aiosqlite:///./data/by_downloader.db"

    max_concurrent_downloads: int = 3
    default_format: str = "mp4"
    default_quality: str = "best"
    rate_limit: int = 0
    proxy: str = ""
    auto_delete_days: int = 7

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_prefix": "BY_DL_", "env_file": ".env"}


settings = Settings()
