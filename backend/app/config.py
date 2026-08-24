"""
Engineering Intelligence Platform — Application Configuration.

Centralizes all configuration via environment variables with Pydantic Settings.
Supports .env files for local development.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve project root (two levels up from this file)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── PostgreSQL ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://pawan@localhost:5432/engineering_intelligence"
    database_url_sync: str = "postgresql://pawan@localhost:5432/engineering_intelligence"

    # ── GitHub ──────────────────────────────────────────────────────────
    github_token: str = ""
    github_default_repo: str = ""

    # ── Ollama (Local LLM) ─────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma3:12b-it-q4_K_M"

    # ── Embedding Model ────────────────────────────────────────────────
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384

    # ── Application ────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"

    # ── CORS ───────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:3000"

    # ── Collection ─────────────────────────────────────────────────────
    max_prs_per_sync: int = 50
    rate_limit_wait: int = 60

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
