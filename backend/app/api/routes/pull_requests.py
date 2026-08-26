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
                "patch": f.patch,
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


@router.get("/{pr_id}/commits/{sha}/diff")
async def get_commit_diff(
    pr_id: int,
    sha: str,
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """
    Fetch on-demand live diff for a specific commit directly from GitHub without storing in DB.
    """
    from app.collectors.github_collector import GitHubCollector
    from app.db.models import Repository

    result = await session.execute(
        select(PullRequest)
        .where(PullRequest.id == pr_id)
    )
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")

    repo_result = await session.execute(
        select(Repository).where(Repository.id == pr.repository_id)
    )
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        async with GitHubCollector() as collector:
            commit_data = await collector.get_commit(repo.owner, repo.name, sha)
    except Exception as e:
        logger.error("Failed to fetch commit %s from GitHub: %s", sha, e)
        raise HTTPException(status_code=502, detail=f"Failed to fetch commit from GitHub: {str(e)}")

    if not commit_data:
        raise HTTPException(status_code=404, detail=f"Commit {sha} not found on GitHub")

    files = []
    for f in commit_data.get("files", []):
        files.append({
            "filename": f.get("filename"),
            "status": f.get("status"),
            "additions": f.get("additions", 0),
            "deletions": f.get("deletions", 0),
            "patch": f.get("patch", ""),
        })

    return {
        "sha": commit_data.get("sha"),
        "message": commit_data.get("commit", {}).get("message", ""),
        "author": commit_data.get("commit", {}).get("author", {}).get("name", ""),
        "date": commit_data.get("commit", {}).get("author", {}).get("date"),
        "stats": commit_data.get("stats", {}),
        "files": files,
    }
