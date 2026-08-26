"""
Engineering Intelligence Platform — Sync API Routes.

Endpoints for triggering and monitoring GitHub data synchronization.
Handles the full pipeline: collect → understand → embed.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_document_service,
    get_embedding_service,
    get_pr_understanding_service,
)
from app.collectors.github_collector import GitHubCollector
from app.config import get_settings
from app.db import repositories as db_repo
from app.db.database import async_session_factory, get_db_session
from app.db.models import SyncStatus

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/repositories", tags=["sync"])


class SyncRequest(BaseModel):
    max_prs: int = 50
    from_date: str | None = None
    to_date: str | None = None


class SyncResponse(BaseModel):
    status: str
    message: str
    sync_log_id: int | None = None


async def _run_full_sync(
    repo_id: int,
    owner: str,
    name: str,
    max_prs: int,
    from_date_str: str | None = None,
    to_date_str: str | None = None,
) -> None:
    """
    Background task: Full sync pipeline with optional date range filtering.

    1. Collect GitHub data
    2. LLM-based PR understanding
    3. Generate engineering documents
    4. Generate embeddings
    """
    from_dt: datetime | None = None
    to_dt: datetime | None = None
    if from_date_str:
        try:
            from_dt = datetime.fromisoformat(from_date_str)
        except Exception:
            pass
    if to_date_str:
        try:
            to_dt = datetime.fromisoformat(to_date_str)
            if to_dt.hour == 0 and to_dt.minute == 0 and to_dt.second == 0:
                to_dt = to_dt.replace(hour=23, minute=59, second=59)
        except Exception:
            pass

    async with async_session_factory() as session:
        # Create sync log
        sync_log = await db_repo.create_sync_log(
            session, repo_id, SyncStatus.COLLECTING
        )
        await db_repo.update_sync_status(session, repo_id, SyncStatus.COLLECTING)
        await session.commit()

        try:
            # ── Phase 1: Collect GitHub Data ────────────────────────────
            logger.info("Sync [%s/%s]: Phase 1 — Collecting GitHub data", owner, name)

            # Get already indexed PR numbers
            existing_pr_numbers = await db_repo.get_existing_pr_numbers(session, repo_id)

            async with GitHubCollector() as collector:
                # Update repo info
                repo_info = await collector.get_repository(owner, name)
                if repo_info:
                    await db_repo.upsert_repository(
                        session,
                        owner=owner,
                        name=name,
                        github_id=repo_info.get("id"),
                        description=repo_info.get("description"),
                        default_branch=repo_info.get("default_branch", "main"),
                    )

                repo = await db_repo.get_repository(session, repo_id)
                since = repo.last_synced_at if (repo and not from_dt) else None

                pr_data_list = await collector.collect_repository_prs(
                    owner,
                    name,
                    max_prs=max_prs,
                    since=since,
                    from_date=from_dt,
                    to_date=to_dt,
                    exclude_pr_numbers=existing_pr_numbers,
                )

            # Store collected data
            prs_collected = 0
            for pr_data in pr_data_list:
                try:
                    pr = await db_repo.upsert_pull_request(
                        session,
                        repository_id=repo_id,
                        pr_data=pr_data["pr"],
                    )
                    await db_repo.upsert_commits(
                        session, pr.id, pr_data.get("commits", [])
                    )
                    await db_repo.upsert_changed_files(
                        session, pr.id, pr_data.get("files", [])
                    )
                    await db_repo.upsert_reviews(
                        session, pr.id, pr_data.get("reviews", [])
                    )
                    await db_repo.upsert_review_comments(
                        session, pr.id, pr_data.get("review_comments", [])
                    )
                    await db_repo.upsert_discussion_comments(
                        session, pr.id, pr_data.get("discussion_comments", [])
                    )
                    await db_repo.upsert_linked_issues(
                        session, pr.id, pr_data.get("linked_issues", [])
                    )
                    prs_collected += 1
                except Exception as e:
                    logger.error("Failed to store PR: %s", e)
                    continue

            await session.commit()
            logger.info("Phase 1 complete: %d PRs collected", prs_collected)

            await db_repo.update_sync_log(
                session, sync_log.id, prs_collected=prs_collected
            )
            await session.commit()

            # ── Phase 2: PR Understanding ───────────────────────────────
            logger.info("Phase 2: Running LLM understanding")
            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.UNDERSTANDING
            )
            await session.commit()

            understanding_service = get_pr_understanding_service()
            prs_understood = await understanding_service.understand_all_prs(
                session, repo_id
            )

            await db_repo.update_sync_log(
                session, sync_log.id, prs_understood=prs_understood
            )
            await session.commit()
            logger.info("Phase 2 complete: %d PRs understood", prs_understood)

            # ── Phase 3: Document Generation ────────────────────────────
            logger.info("Phase 3: Generating engineering documents")
            doc_service = get_document_service()
            docs_created = await doc_service.create_documents_for_repo(
                session, repo_id
            )

            await db_repo.update_sync_log(
                session, sync_log.id, documents_created=docs_created
            )
            await session.commit()
            logger.info("Phase 3 complete: %d documents created", docs_created)

            # ── Phase 4: Embedding Generation ───────────────────────────
            logger.info("Phase 4: Generating embeddings")
            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.EMBEDDING
            )
            await session.commit()

            embed_service = get_embedding_service()
            embeddings_generated = await embed_service.embed_all_documents(
                session, repo_id
            )

            await db_repo.update_sync_log(
                session, sync_log.id, embeddings_generated=embeddings_generated
            )
            await session.commit()
            logger.info("Phase 4 complete: %d embeddings generated", embeddings_generated)

            # ── Complete ────────────────────────────────────────────────
            total_in_db = await db_repo.count_prs_by_repo(session, repo_id)
            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.COMPLETED, total_prs=total_in_db
            )
            await db_repo.update_sync_log(
                session,
                sync_log.id,
                status=SyncStatus.COMPLETED,
                completed_at=datetime.now(timezone.utc),
            )
            await session.commit()

            logger.info(
                "Full sync complete for %s/%s: %d PRs, %d understood, %d docs, %d embeddings",
                owner, name, prs_collected, prs_understood, docs_created, embeddings_generated,
            )

        except Exception as e:
            logger.error("Sync failed for %s/%s: %s", owner, name, e, exc_info=True)
            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.FAILED
            )
            await db_repo.update_sync_log(
                session,
                sync_log.id,
                status=SyncStatus.FAILED,
                error_message=str(e),
                completed_at=datetime.now(timezone.utc),
            )
            await session.commit()


@router.post("/{repo_id}/sync", response_model=SyncResponse)
async def sync_repository(
    repo_id: int,
    request: SyncRequest = SyncRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """
    Trigger full sync pipeline for a repository.

    This runs as a background task and returns immediately.
    Pipeline: Collect → Understand → Document → Embed
    """
    repo = await db_repo.get_repository(session, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if repo.sync_status in (SyncStatus.COLLECTING, SyncStatus.UNDERSTANDING, SyncStatus.EMBEDDING):
        return {
            "status": "already_running",
            "message": f"Sync already in progress (status: {repo.sync_status.value})",
            "sync_log_id": None,
        }

    # Launch background sync
    background_tasks.add_task(
        _run_full_sync,
        repo_id=repo.id,
        owner=repo.owner,
        name=repo.name,
        max_prs=request.max_prs,
        from_date_str=request.from_date,
        to_date_str=request.to_date,
    )

    date_msg = ""
    if request.from_date or request.to_date:
        date_msg = f" ({request.from_date or 'start'} to {request.to_date or 'now'})"

    return {
        "status": "started",
        "message": f"Sync started for {repo.full_name} (max {request.max_prs} PRs{date_msg})",
        "sync_log_id": None,
    }


@router.get("/{repo_id}/status")
async def get_sync_status(
    repo_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Get current sync status for a repository."""
    repo = await db_repo.get_repository(session, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    return {
        "sync_status": repo.sync_status.value,
        "total_prs_synced": repo.total_prs_synced,
        "last_synced_at": repo.last_synced_at.isoformat() if repo.last_synced_at else None,
    }


@router.post("/{repo_id}/cancel")
async def cancel_sync(
    repo_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Cancel or reset sync status for a repository."""
    repo = await db_repo.get_repository(session, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    await db_repo.update_sync_status(session, repo.id, SyncStatus.COMPLETED)
    await session.commit()
    return {
        "status": "cancelled",
        "message": f"Sync status reset for {repo.full_name}",
    }
