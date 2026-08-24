"""
Engineering Intelligence Platform — Pull Request API Routes.

Endpoints for browsing collected pull requests and their knowledge.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import repositories as db_repo
from app.db.database import get_db_session
from app.db.models import PullRequest, PRKnowledge, Commit, ChangedFile, Review

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pull-requests", tags=["pull-requests"])


@router.get("")
async def list_pull_requests(
    repo_id: int = Query(..., description="Repository ID"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """List pull requests with pagination."""
    prs = await db_repo.get_pull_requests_by_repo(
        session, repo_id, limit=limit, offset=offset
    )
    total = await db_repo.count_prs_by_repo(session, repo_id)

    return {
        "items": [
            {
                "id": pr.id,
                "pr_number": pr.github_pr_number,
                "title": pr.title,
                "author": pr.author,
                "state": pr.state,
                "is_merged": pr.is_merged,
                "labels": pr.labels,
                "milestone": pr.milestone,
                "additions": pr.additions,
                "deletions": pr.deletions,
                "changed_files_count": pr.changed_files_count,
                "created_at": pr.github_created_at.isoformat() if pr.github_created_at else None,
                "merged_at": pr.github_merged_at.isoformat() if pr.github_merged_at else None,
                "html_url": pr.html_url,
                "has_knowledge": False,  # Will be enriched below
            }
            for pr in prs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{pr_id}")
async def get_pull_request(
    pr_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Get detailed pull request information with knowledge."""
    result = await session.execute(
        select(PullRequest)
        .options(
            selectinload(PullRequest.commits),
            selectinload(PullRequest.changed_files),
            selectinload(PullRequest.reviews),
            selectinload(PullRequest.review_comments),
            selectinload(PullRequest.discussion_comments),
            selectinload(PullRequest.linked_issues),
            selectinload(PullRequest.knowledge),
        )
        .where(PullRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()

    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")

    knowledge_data = None
    if pr.knowledge:
        knowledge_data = {
            "summary": pr.knowledge.summary,
            "motivation": pr.knowledge.motivation,
            "components": pr.knowledge.components,
            "change_types": pr.knowledge.change_types,
            "impact": pr.knowledge.impact,
            "architectural_change": pr.knowledge.architectural_change,
            "key_decisions": pr.knowledge.key_decisions,
            "review_highlights": pr.knowledge.review_highlights,
            "evidence_classification": pr.knowledge.evidence_classification,
            "llm_model": pr.knowledge.llm_model,
            "processing_time_ms": pr.knowledge.processing_time_ms,
        }

    return {
        "id": pr.id,
        "pr_number": pr.github_pr_number,
        "title": pr.title,
        "description": pr.description,
        "author": pr.author,
        "state": pr.state,
        "is_merged": pr.is_merged,
        "labels": pr.labels,
        "reviewers": pr.reviewers,
        "milestone": pr.milestone,
        "additions": pr.additions,
        "deletions": pr.deletions,
        "changed_files_count": pr.changed_files_count,
        "created_at": pr.github_created_at.isoformat() if pr.github_created_at else None,
        "merged_at": pr.github_merged_at.isoformat() if pr.github_merged_at else None,
        "html_url": pr.html_url,
        "commits": [
            {
                "sha": c.sha,
                "message": c.message,
                "author_name": c.author_name,
                "committed_at": c.committed_at.isoformat() if c.committed_at else None,
            }
            for c in pr.commits
        ],
        "changed_files": [
            {
                "filename": f.filename,
                "status": f.status,
                "additions": f.additions,
                "deletions": f.deletions,
            }
            for f in pr.changed_files
        ],
        "reviews": [
            {
                "author": r.author,
                "state": r.state,
                "body": r.body,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            }
            for r in pr.reviews
        ],
        "knowledge": knowledge_data,
    }
