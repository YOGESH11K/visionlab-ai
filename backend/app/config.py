"""Application configuration loaded from environment / .env file."""
from functools import lru_cache
from pathlib import Path
from typing import Annotated, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Central settings object. All values overridable via env vars or a .env file."""

    model_config = SettingsConfigDict(
        env_prefix="EMPIRE_",
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True
    log_level: str = "INFO"
    cors_origins: Annotated[List[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        """Accept a comma-separated string from env (Render/Vercel style)."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    # Database
    db_url: str = f"sqlite:///{BASE_DIR / 'data' / 'empire.db'}"

    # Camera / vision
    camera_index: int = 0
    vision_width: int = 640
    vision_height: int = 480
    stream_fps: int = 15
    inference_fps: int = 12

    # Serial / hardware
    serial_baud: int = 9600
    serial_timeout: float = 0.1
    default_board: str = "Arduino Uno"

    # AI (optional)
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout: int = 30

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_api_key.strip())

    @property
    def data_dir(self) -> Path:
        d = BASE_DIR / "data"
        d.mkdir(parents=True, exist_ok=True)
        return d


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
