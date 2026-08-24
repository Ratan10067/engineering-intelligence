"""
Engineering Intelligence Platform — Async Database Engine & Session.

Provides an async SQLAlchemy engine with connection pooling and an
async session factory for use throughout the application.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# ── Async Engine ────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.is_development,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
)

# ── Session Factory ─────────────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base Model ──────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


# ── Dependency ──────────────────────────────────────────────────────────────
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session and handles cleanup."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
