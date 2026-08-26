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
) -> AsyncGenerator[str, None]:
    """
    Generator that runs the full sync pipeline and yields SSE events.

    Pipeline: Collect → Understand → Document → Embed
    Each step emits events so the frontend can render live progress.
    """
    start_time = time.monotonic()

    async with async_session_factory() as session:
        sync_log = await db_repo.create_sync_log(
            session, repo_id, SyncStatus.COLLECTING
        )
        await db_repo.update_sync_status(session, repo_id, SyncStatus.COLLECTING)
        await session.commit()

        try:
            # ── Phase 1: Collect GitHub Data ────────────────────────────
            yield _sse_event("phase", {
                "phase": "collecting",
                "message": f"Fetching PRs from GitHub for {owner}/{name}...",
            })

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
                since = repo.last_synced_at if repo else None

                pr_data_list = await collector.collect_repository_prs(
                    owner, name, max_prs=max_prs, since=since
                )

            yield _sse_event("fetch_summary", {
                "total_fetched": len(pr_data_list),
                "message": f"Fetched {len(pr_data_list)} PRs from GitHub",
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
            prs_without_knowledge = await db_repo.get_prs_without_knowledge(
                session, repo_id
            )
            prs_understood = 0
            total_to_understand = len(prs_without_knowledge)

            for idx, pr in enumerate(prs_without_knowledge):
                try:
                    yield _sse_event("llm_start", {
                        "index": idx + 1,
                        "total": total_to_understand,
                        "pr_number": pr.github_pr_number,
                        "title": pr.title,
                        "message": f"Sending PR #{pr.github_pr_number} to LLM...",
                    })

                    result = await understanding_service.understand_pr(session, pr.id)

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

            await db_repo.update_sync_status(
                session, repo_id, SyncStatus.COMPLETED, total_prs=prs_collected
            )
            await db_repo.update_sync_log(
                session,
                sync_log.id,
                status=SyncStatus.COMPLETED,
                completed_at=datetime.now(timezone.utc),
            )
            await session.commit()

            yield _sse_event("completed", {
                "total_prs": prs_collected,
                "total_understood": prs_understood,
                "total_docs": docs_created,
                "total_embeddings": embeddings_generated,
                "elapsed_seconds": elapsed,
                "message": f"Sync complete! {prs_collected} PRs indexed in {elapsed}s",
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
) -> StreamingResponse:
    """
    Stream live sync progress via Server-Sent Events.

    Opens an SSE connection and streams events for each step of the
    sync pipeline: collect → understand → document → embed.
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
        _run_live_sync(repo_id, owner, name, max_prs),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
