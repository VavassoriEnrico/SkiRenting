from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "SkiRenting API"
    debug: bool = Field(default=False, validation_alias="SKIRENTING_DEBUG")
    cors_origins: list[str] = ["http://localhost:5174", "http://127.0.0.1:5174"]
    database_url: SecretStr | None = None
    supabase_url: str = ""
    supabase_publishable_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
