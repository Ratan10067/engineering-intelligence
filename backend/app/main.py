"""
Engineering Intelligence Platform — FastAPI Application.

Main entry point for the backend API server.
Configures CORS, registers routers, and manages application lifecycle.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    pull_requests,
    questions,
    releases,
    repositories,
    search,
    sync,
    sync_live,
    webhooks,
)
from app.config import get_settings

settings = get_settings()

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s │ %(levelname)-7s │ %(name)-28s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("engineering_intelligence.main")

# Silence SQLAlchemy engine echo logs (they spam every 8s from dashboard polling)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


# ── Lifespan ────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    logger.info("🚀 Engineering Intelligence Platform starting up...")
    logger.info("   Environment: %s", settings.app_env)
    logger.info("   Ollama Model: %s", settings.ollama_model)
    logger.info("   Embedding Model: %s", settings.embedding_model)

    # Pre-warm the embedding model (optional, loads on first use)
    # from app.api.deps import get_embedding_service
    # get_embedding_service()._load_model()

    yield

    logger.info("Engineering Intelligence Platform shutting down...")
    # Cleanup
    from app.api.deps import _ollama_provider

    if _ollama_provider:
        await _ollama_provider.close()


# ── FastAPI App ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Engineering Intelligence Platform",
    description=(
        "AI-powered platform that converts GitHub engineering history "
        "into searchable Engineering Memory with evidence-backed Q&A."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ──────────────────────────────────────────────────────────────────

app.include_router(repositories.router)
app.include_router(sync.router)
app.include_router(sync_live.router)
app.include_router(pull_requests.router)
app.include_router(search.router)
app.include_router(questions.router)
app.include_router(releases.router)
app.include_router(webhooks.router, prefix="/api")


# ── Health Check ────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "engineering-intelligence"}


@app.get("/api/health/detailed")
async def detailed_health_check() -> dict[str, Any]:
    """Detailed health check with dependency status."""
    from app.api.deps import get_llm_provider

    ollama_healthy = False
    try:
        ollama_healthy = await get_llm_provider().health_check()
    except Exception:
        pass

    return {
        "status": "healthy",
        "service": "engineering-intelligence",
        "ollama": "connected" if ollama_healthy else "disconnected",
        "model": settings.ollama_model,
        "environment": settings.app_env,
    }
