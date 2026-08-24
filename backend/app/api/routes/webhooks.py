"""
Engineering Intelligence Platform — GitHub Webhook Handler.

Listens for real-time GitHub webhook events (e.g. pull_request.closed when merged)
and autonomously triggers the full ingestion, LLM understanding, document generation,
and vector embedding pipeline without any manual intervention.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
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

logger = logging.getLogger("engineering_intelligence.webhooks")
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def _verify_signature(payload_body: bytes, secret: str, signature_header: str | None) -> bool:
    """Verify GitHub HMAC-SHA256 signature."""
    if not secret:
        # If no secret is configured, accept the payload
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected_hash = hmac.new(
        secret.encode("utf-8"), payload_body, hashlib.sha256
    ).hexdigest()
    received_hash = signature_header[7:]
    return hmac.compare_digest(expected_hash, received_hash)


async def process_merged_pr_webhook(
    repo_full_name: str,
    pr_data: dict[str, Any],
) -> None:
    """
    Background worker: Process an autonomously received merged PR event.
    Executes: Ingest PR + Sub-resources → LLM Understanding → Document Creation → Vector Embedding.
    """
    settings = get_settings()
    pr_number = pr_data.get("number")
    pr_title = pr_data.get("title")

    logger.info("⚡ [WEBHOOK] Processing merged PR #%s ('%s') for repository '%s'", pr_number, pr_title, repo_full_name)

    async with async_session_factory() as session:
        # 1. Ensure repository is registered
        repo_parts = repo_full_name.split("/")
        owner, name = repo_parts[0], repo_parts[1]
        repo = await db_repo.get_repository_by_name(session, repo_full_name)
        if not repo:
            repo = await db_repo.upsert_repository(
                session,
                owner=owner,
                name=name,
                description=pr_data.get("head", {}).get("repo", {}).get("description"),
                default_branch="main",
            )
            await session.commit()

        # 2. Fetch full sub-resources from GitHub API (commits, files, reviews, comments)
        detailed_pr = pr_data
        commits: list[dict[str, Any]] = []
        changed_files: list[dict[str, Any]] = []
        reviews: list[dict[str, Any]] = []
        review_comments: list[dict[str, Any]] = []
        discussion_comments: list[dict[str, Any]] = []
        linked_issues: list[dict[str, Any]] = []

        try:
            async def _fetch_remote() -> None:
                nonlocal detailed_pr, commits, changed_files, reviews, review_comments, discussion_comments, linked_issues
                async with GitHubCollector(settings.github_token) as collector:
                    remote_pr = await collector.get_pull_request(owner, name, pr_number)
                    if remote_pr:
                        detailed_pr = remote_pr
                    commits = await collector.get_pr_commits(owner, name, pr_number)
                    changed_files = await collector.get_pr_files(owner, name, pr_number)
                    reviews = await collector.get_pr_reviews(owner, name, pr_number)
                    review_comments = await collector.get_pr_review_comments(owner, name, pr_number)
                    discussion_comments = await collector.get_pr_comments(owner, name, pr_number)
                    linked_issues = await collector.get_linked_issues(
                        owner, name, detailed_pr.get("body") or ""
                    )

            import asyncio
            await asyncio.wait_for(_fetch_remote(), timeout=10.0)
        except Exception as e:
            logger.warning("Could not fetch remote sub-resources from GitHub: %s. Using webhook payload directly.", e)

        # 3. Store in Database
        db_pr = await db_repo.upsert_pull_request(session, repository_id=repo.id, pr_data=detailed_pr)
        await db_repo.upsert_commits(session, db_pr.id, commits)
        await db_repo.upsert_changed_files(session, db_pr.id, changed_files)
        await db_repo.upsert_reviews(session, db_pr.id, reviews)
        await db_repo.upsert_review_comments(session, db_pr.id, review_comments)
        await db_repo.upsert_discussion_comments(session, db_pr.id, discussion_comments)
        await db_repo.upsert_linked_issues(session, db_pr.id, linked_issues)
        await session.commit()
        logger.info("📥 [WEBHOOK] Stored PR #%s data & sub-resources in database", pr_number)

        # 4. LLM Understanding
        try:
            pr_understanding_svc = get_pr_understanding_service()
            await pr_understanding_svc.understand_pr(session, db_pr.id)
            await session.commit()
            logger.info("🧠 [WEBHOOK] LLM understanding extracted for PR #%s", pr_number)
        except Exception as e:
            logger.error("⚠️ [WEBHOOK] LLM understanding error: %s", e)

        # 5. Engineering Document Creation
        doc_svc = get_document_service()
        docs = await doc_svc.create_documents_for_pr(session, db_pr.id)
        await session.commit()
        logger.info("📚 [WEBHOOK] Created %d engineering documents for PR #%s", len(docs), pr_number)

        # 6. Vector Embedding Generation
        embedding_svc = get_embedding_service()
        await embedding_svc.embed_all_documents(session, repo.id)
        await session.commit()
        logger.info("📐 [WEBHOOK] Vector embeddings generated and indexed with pgvector for PR #%s", pr_number)

        # 7. Update repository PR count
        count = await db_repo.count_prs_by_repo(session, repo.id)
        await db_repo.update_sync_status(session, repo.id, SyncStatus.COMPLETED, total_prs=count)
        await session.commit()
        logger.info("✅ [WEBHOOK] Pipeline complete for PR #%s! Ready for search and Q&A.", pr_number)


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_github_event: str | None = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
) -> dict[str, Any]:
    """
    GitHub Webhook receiver endpoint.
    Automatically handles 'pull_request.closed' (when merged) to update the engineering memory.
    """
    settings = get_settings()
    body_bytes = await request.body()

    # 1. Verify webhook signature if secret is configured
    if settings.github_webhook_secret:
        if not _verify_signature(body_bytes, settings.github_webhook_secret, x_hub_signature_256):
            logger.warning("❌ [WEBHOOK] Invalid HMAC signature rejected.")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # 2. Parse JSON payload
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # 3. Handle Ping Event (when creating webhook on GitHub)
    if x_github_event == "ping":
        logger.info("🏓 [WEBHOOK] Received GitHub ping event: %s", payload.get("zen", "pong"))
        return {"status": "ok", "event": "ping", "message": "GitHub Webhook connected successfully!"}

    # 4. Handle Pull Request Events
    if x_github_event == "pull_request":
        action = payload.get("action")
        pr = payload.get("pull_request", {})
        is_merged = pr.get("merged", False)
        repo_full_name = payload.get("repository", {}).get("full_name")

        logger.info(
            "📨 [WEBHOOK] Pull request event received: repo='%s', action='%s', is_merged=%s, PR #%s",
            repo_full_name,
            action,
            is_merged,
            pr.get("number"),
        )

        # Only trigger full pipeline when the PR is closed AND merged into the codebase
        if action == "closed" and is_merged:
            background_tasks.add_task(
                process_merged_pr_webhook,
                repo_full_name=repo_full_name,
                pr_data=pr,
            )
            return {
                "status": "processing",
                "event": "pull_request.merged",
                "pr_number": pr.get("number"),
                "message": f"Autonomous ingestion triggered for PR #{pr.get('number')}",
            }

        return {
            "status": "ignored",
            "event": "pull_request",
            "action": action,
            "message": "Only closed & merged pull requests trigger ingestion.",
        }

    return {"status": "ignored", "event": x_github_event}
