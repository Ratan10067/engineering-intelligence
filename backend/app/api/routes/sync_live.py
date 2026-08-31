"""
Engineering Intelligence Platform — Live Sync SSE Endpoint.

Streams real-time sync progress to the frontend via Server-Sent Events.
Each step of the pipeline (fetch, understand, embed) emits events
so the UI can show exactly what is happening.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_document_service,
    get_embedding_service,
    get_pr_understanding_service,
)
from app.collectors.github_collector import GitHubCollector
from app.config import get_settings
from app.db import repositories as db_repo
from app.db.database import async_session_factory
from app.db.models import SyncStatus

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/repositories", tags=["sync-live"])


def _sse_event(event_type: str, data: dict[str, Any]) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data, default=str)
    return f"event: {event_type}\ndata: {payload}\n\n"


async def _run_live_sync(
    repo_id: int,
    owner: str,
    name: str,
    max_prs: int,
    from_date_str: str | None = None,
    to_date_str: str | None = None,
) -> AsyncGenerator[str, None]:
    """Execute sync pipeline and yield SSE event strings."""
    start_time = time.monotonic()

    # Parse date range filters if provided
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
            # Set to end of day if only date is specified (e.g. 2026-07-31 -> 2026-07-31 23:59:59)
            if to_dt.hour == 0 and to_dt.minute == 0 and to_dt.second == 0:
                to_dt = to_dt.replace(hour=23, minute=59, second=59)
        except Exception:
            pass

    async with async_session_factory() as session:
        # Create sync log and mark repo as collecting
        sync_log = await db_repo.create_sync_log(
            session, repo_id, SyncStatus.COLLECTING
        )
        await db_repo.update_sync_status(session, repo_id, SyncStatus.COLLECTING)
        await session.commit()

        try:
            # ── Phase 1: Collect GitHub Data ────────────────────────────
            date_filter_msg = ""
            if from_date_str and to_date_str:
                date_filter_msg = f" between {from_date_str} and {to_date_str}"
            elif from_date_str:
                date_filter_msg = f" since {from_date_str}"
            elif to_date_str:
                date_filter_msg = f" until {to_date_str}"

            yield _sse_event("phase", {
                "phase": "collecting",
                "message": f"Fetching PRs from GitHub for {owner}/{name}{date_filter_msg}...",
            })

            # Get already indexed PR numbers so subsequent syncs fetch the next new/unindexed PRs
            existing_pr_numbers = await db_repo.get_existing_pr_numbers(session, repo_id)

            async with GitHubCollector() as collector:
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

            yield _sse_event("fetch_summary", {
                "total_fetched": len(pr_data_list),
                "message": f"Fetched {len(pr_data_list)} new PRs from GitHub{date_filter_msg} (skipped {len(existing_pr_numbers)} already indexed)",
            })

            # Store collected data and emit per-PR events
            prs_collected = 0
            stored_pr_ids = []
            for idx, pr_data in enumerate(pr_data_list):
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
                    stored_pr_ids.append(pr.id)

                    yield _sse_event("pr_fetched", {
                        "index": idx + 1,
                        "total": len(pr_data_list),
                        "pr_number": pr.github_pr_number,
                        "title": pr.title,
                        "author": pr.author,
                        "additions": pr.additions,
                        "deletions": pr.deletions,
                        "files_count": pr.changed_files_count,
                    })

                except Exception as e:
                    logger.error("Failed to store PR: %s", e)
                    yield _sse_event("pr_error", {
                        "index": idx + 1,
                        "error": str(e),
                    })
                    continue

            await session.commit()

            await db_repo.update_sync_log(
                session, sync_log.id, prs_collected=prs_collected
            )
            await session.commit()

            # ── Phase 2: PR Understanding (LLM) ─────────────────────────
            yield _sse_event("phase", {
                "phase": "understanding",
                "message": f"Analyzing {prs_collected} PRs with LLM ({settings.ollama_model})...",
            })

            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.UNDERSTANDING
            )
            await session.commit()

            understanding_service = get_pr_understanding_service()
            prs_without_knowledge = await db_repo.get_unlocked_prs_without_knowledge(
                session, repo_id, stale_timeout_minutes=settings.pr_lock_timeout_minutes
            )
            prs_understood = 0
            total_to_understand = len(prs_without_knowledge)

            for idx, pr in enumerate(prs_without_knowledge):
                try:
                    # Attempt lock acquisition
                    lock_acquired = await db_repo.acquire_pr_lock(
                        session,
                        pr.id,
                        worker_id=settings.worker_id,
                        stale_timeout_minutes=settings.pr_lock_timeout_minutes,
                    )
                    if not lock_acquired:
                        yield _sse_event("pr_skipped", {
                            "index": idx + 1,
                            "total": total_to_understand,
                            "pr_number": pr.github_pr_number,
                            "title": pr.title,
                            "message": f"PR #{pr.github_pr_number} is currently locked by another worker, skipping...",
                        })
                        continue

                    yield _sse_event("llm_start", {
                        "index": idx + 1,
                        "total": total_to_understand,
                        "pr_number": pr.github_pr_number,
                        "title": pr.title,
                        "message": f"Sending PR #{pr.github_pr_number} to LLM...",
                    })

                    result = await understanding_service.understand_pr(
                        session,
                        pr.id,
                        worker_id=settings.worker_id,
                        stale_timeout_minutes=settings.pr_lock_timeout_minutes,
                    )

                    if result:
                        prs_understood += 1
                        await session.commit()

                        yield _sse_event("pr_understood", {
                            "index": idx + 1,
                            "total": total_to_understand,
                            "pr_number": pr.github_pr_number,
                            "title": pr.title,
                            "llm_summary": result.get("summary", ""),
                            "llm_motivation": result.get("motivation", ""),
                            "llm_components": result.get("components", []),
                            "llm_change_types": result.get("change_types", []),
                            "llm_response": result,
                        })
                    else:
                        yield _sse_event("llm_failed", {
                            "index": idx + 1,
                            "total": total_to_understand,
                            "pr_number": pr.github_pr_number,
                            "message": "LLM returned no structured data",
                        })

                except Exception as e:
                    logger.error("Failed to understand PR #%d: %s", pr.github_pr_number, e)
                    await session.rollback()
                    yield _sse_event("llm_failed", {
                        "index": idx + 1,
                        "total": total_to_understand,
                        "pr_number": pr.github_pr_number,
                        "message": str(e),
                    })
                    continue

            await db_repo.update_sync_log(
                session, sync_log.id, prs_understood=prs_understood
            )
            await session.commit()

            # ── Phase 3: Document Generation ─────────────────────────────
            yield _sse_event("phase", {
                "phase": "documenting",
                "message": "Generating searchable engineering documents...",
            })

            doc_service = get_document_service()
            docs_created = await doc_service.create_documents_for_repo(
                session, repo_id
            )

            await db_repo.update_sync_log(
                session, sync_log.id, documents_created=docs_created
            )
            await session.commit()

            yield _sse_event("docs_created", {
                "count": docs_created,
                "message": f"Created {docs_created} engineering documents",
            })

            # ── Phase 4: Embedding Generation ────────────────────────────
            yield _sse_event("phase", {
                "phase": "embedding",
                "message": "Generating vector embeddings for search...",
            })

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

            yield _sse_event("embeddings_done", {
                "count": embeddings_generated,
                "message": f"Generated {embeddings_generated} vector embeddings",
            })

            # ── Complete ─────────────────────────────────────────────────
            elapsed = round(time.monotonic() - start_time, 1)
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

            yield _sse_event("completed", {
                "total_prs": total_in_db,
                "prs_new": prs_collected,
                "total_understood": prs_understood,
                "total_docs": docs_created,
                "total_embeddings": embeddings_generated,
                "elapsed_seconds": elapsed,
                "message": f"Sync complete! {prs_collected} new PRs indexed ({total_in_db} total) in {elapsed}s",
            })

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

            yield _sse_event("error", {
                "message": f"Sync failed: {str(e)}",
            })


@router.get("/{repo_id}/sync/live")
async def sync_repository_live(
    repo_id: int,
    max_prs: int = Query(default=10, ge=1, le=500),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
) -> StreamingResponse:
    """
    Stream live sync progress via Server-Sent Events with optional date range filtering.
    """
    async with async_session_factory() as session:
        repo = await db_repo.get_repository(session, repo_id)
        if not repo:
            raise HTTPException(status_code=404, detail="Repository not found")

        if repo.sync_status in (SyncStatus.COLLECTING, SyncStatus.UNDERSTANDING, SyncStatus.EMBEDDING):
            raise HTTPException(
                status_code=409,
                detail=f"Sync already in progress (status: {repo.sync_status.value})"
            )

        owner = repo.owner
        name = repo.name

    return StreamingResponse(
        _run_live_sync(repo_id, owner, name, max_prs, from_date, to_date),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
