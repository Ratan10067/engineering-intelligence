"""
Engineering Intelligence Platform — Repository API Routes.

Endpoints for managing tracked GitHub repositories.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import repositories as db_repo
from app.db.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repositories", tags=["repositories"])


# ── Request/Response Models ─────────────────────────────────────────────────


class CreateRepositoryRequest(BaseModel):
    full_name: str  # owner/repo format


class RepositoryResponse(BaseModel):
    id: int
    owner: str
    name: str
    full_name: str
    description: str | None
    default_branch: str
    sync_status: str
    total_prs_synced: int
    last_synced_at: str | None
    created_at: str

    class Config:
        from_attributes = True


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("", response_model=RepositoryResponse)
async def create_repository(
    request: CreateRepositoryRequest,
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Register a GitHub repository for tracking."""
    parts = request.full_name.strip().split("/")
    if len(parts) != 2:
        raise HTTPException(
            status_code=400,
            detail="Repository name must be in 'owner/repo' format",
        )

    owner, name = parts
    repo = await db_repo.upsert_repository(
        session, owner=owner, name=name
    )
    await session.commit()

    return {
        "id": repo.id,
        "owner": repo.owner,
        "name": repo.name,
        "full_name": repo.full_name,
        "description": repo.description,
        "default_branch": repo.default_branch,
        "sync_status": repo.sync_status.value,
        "total_prs_synced": repo.total_prs_synced,
        "last_synced_at": repo.last_synced_at.isoformat() if repo.last_synced_at else None,
        "created_at": repo.created_at.isoformat(),
    }


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """List all tracked repositories."""
    repos = await db_repo.get_all_repositories(session)
    return [
        {
            "id": r.id,
            "owner": r.owner,
            "name": r.name,
            "full_name": r.full_name,
            "description": r.description,
            "default_branch": r.default_branch,
            "sync_status": r.sync_status.value,
            "total_prs_synced": r.total_prs_synced,
            "last_synced_at": r.last_synced_at.isoformat() if r.last_synced_at else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in repos
    ]


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Get a specific repository."""
    repo = await db_repo.get_repository(session, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    return {
        "id": repo.id,
        "owner": repo.owner,
        "name": repo.name,
        "full_name": repo.full_name,
        "description": repo.description,
        "default_branch": repo.default_branch,
        "sync_status": repo.sync_status.value,
        "total_prs_synced": repo.total_prs_synced,
        "last_synced_at": repo.last_synced_at.isoformat() if repo.last_synced_at else None,
        "created_at": repo.created_at.isoformat(),
    }
