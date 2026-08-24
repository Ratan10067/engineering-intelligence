"""
Engineering Intelligence Platform — Database CRUD Operations.

Provides idempotent upsert operations for all GitHub data entities.
Uses PostgreSQL ON CONFLICT for safe re-ingestion.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ChangedFile,
    Commit,
    DiscussionComment,
    EngineeringDocument,
    LinkedIssue,
    PRKnowledge,
    PullRequest,
    Repository,
    Review,
    ReviewComment,
    SyncLog,
    SyncStatus,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Repository CRUD
# =============================================================================


async def upsert_repository(
    session: AsyncSession,
    *,
    owner: str,
    name: str,
    github_id: int | None = None,
    description: str | None = None,
    default_branch: str = "main",
) -> Repository:
    """Insert or update a repository by full_name."""
    full_name = f"{owner}/{name}"

    stmt = (
        pg_insert(Repository)
        .values(
            owner=owner,
            name=name,
            full_name=full_name,
            github_id=github_id,
            description=description,
            default_branch=default_branch,
        )
        .on_conflict_do_update(
            index_elements=["full_name"],
            set_={
                "github_id": github_id,
                "description": description,
                "default_branch": default_branch,
                "updated_at": datetime.now(timezone.utc),
            },
        )
        .returning(Repository)
    )
    result = await session.execute(stmt)
    repo = result.scalar_one()
    await session.flush()
    return repo


async def get_repository(session: AsyncSession, repo_id: int) -> Repository | None:
    """Get a repository by ID."""
    result = await session.execute(
        select(Repository).where(Repository.id == repo_id)
    )
    return result.scalar_one_or_none()


async def get_repository_by_name(
    session: AsyncSession, full_name: str
) -> Repository | None:
    """Get a repository by full name (owner/repo)."""
    result = await session.execute(
        select(Repository).where(Repository.full_name == full_name)
    )
    return result.scalar_one_or_none()


async def get_all_repositories(session: AsyncSession) -> list[Repository]:
    """Get all tracked repositories."""
    result = await session.execute(
        select(Repository).where(Repository.is_active == True).order_by(Repository.created_at.desc())
    )
    return list(result.scalars().all())


async def update_sync_status(
    session: AsyncSession,
    repo_id: int,
    status: SyncStatus,
    total_prs: int | None = None,
) -> None:
    """Update repository sync status."""
    values: dict[str, Any] = {
        "sync_status": status,
        "updated_at": datetime.now(timezone.utc),
    }
    if status == SyncStatus.COMPLETED:
        values["last_synced_at"] = datetime.now(timezone.utc)
    if total_prs is not None:
        values["total_prs_synced"] = total_prs
    await session.execute(
        update(Repository).where(Repository.id == repo_id).values(**values)
    )
    await session.flush()


# =============================================================================
# Pull Request CRUD
# =============================================================================


async def upsert_pull_request(
    session: AsyncSession,
    *,
    repository_id: int,
    pr_data: dict[str, Any],
) -> PullRequest:
    """Insert or update a pull request using GitHub data."""
    labels_list = [label["name"] for label in pr_data.get("labels", [])]
    reviewers_list = [r["login"] for r in pr_data.get("requested_reviewers", [])]
    milestone_title = (
        pr_data["milestone"]["title"] if pr_data.get("milestone") else None
    )

    values = {
        "repository_id": repository_id,
        "github_pr_id": pr_data["id"],
        "github_pr_number": pr_data["number"],
        "title": pr_data["title"],
        "description": pr_data.get("body"),
        "author": pr_data["user"]["login"],
        "state": pr_data["state"],
        "is_merged": pr_data.get("merged", False) or pr_data.get("merge_commit_sha") is not None,
        "labels": labels_list,
        "reviewers": reviewers_list,
        "milestone": milestone_title,
        "additions": pr_data.get("additions", 0),
        "deletions": pr_data.get("deletions", 0),
        "changed_files_count": pr_data.get("changed_files", 0),
        "github_created_at": pr_data.get("created_at"),
        "github_merged_at": pr_data.get("merged_at"),
        "github_closed_at": pr_data.get("closed_at"),
        "html_url": pr_data.get("html_url"),
        "raw_data": pr_data,
    }

    stmt = (
        pg_insert(PullRequest)
        .values(**values)
        .on_conflict_do_update(
            constraint="uq_repo_pr_number",
            set_={
                k: v
                for k, v in values.items()
                if k not in ("repository_id", "github_pr_id", "github_pr_number")
            },
        )
        .returning(PullRequest)
    )
    result = await session.execute(stmt)
    pr = result.scalar_one()
    await session.flush()
    return pr


async def get_pull_request(
    session: AsyncSession, pr_id: int
) -> PullRequest | None:
    """Get a pull request by internal ID with all relationships loaded."""
    result = await session.execute(
        select(PullRequest).where(PullRequest.id == pr_id)
    )
    return result.scalar_one_or_none()


async def get_pull_requests_by_repo(
    session: AsyncSession,
    repo_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[PullRequest]:
    """Get pull requests for a repository."""
    result = await session.execute(
        select(PullRequest)
        .where(PullRequest.repository_id == repo_id)
        .order_by(PullRequest.github_pr_number.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def get_prs_without_knowledge(
    session: AsyncSession, repo_id: int
) -> list[PullRequest]:
    """Get PRs that haven't been analyzed by the LLM yet."""
    result = await session.execute(
        select(PullRequest)
        .outerjoin(PRKnowledge)
        .where(
            PullRequest.repository_id == repo_id,
            PRKnowledge.id == None,
        )
        .order_by(PullRequest.github_pr_number)
    )
    return list(result.scalars().all())


async def count_prs_by_repo(session: AsyncSession, repo_id: int) -> int:
    """Count pull requests for a repository."""
    from sqlalchemy import func

    result = await session.execute(
        select(func.count()).select_from(PullRequest).where(
            PullRequest.repository_id == repo_id
        )
    )
    return result.scalar_one()


# =============================================================================
# Commits, Files, Reviews, Comments — Batch Upsert
# =============================================================================


async def upsert_commits(
    session: AsyncSession,
    pull_request_id: int,
    commits_data: list[dict[str, Any]],
) -> int:
    """Batch upsert commits for a PR. Returns count of upserted rows."""
    if not commits_data:
        return 0

    for commit_data in commits_data:
        commit_info = commit_data.get("commit", {})
        author_info = commit_info.get("author", {})
        stmt = (
            pg_insert(Commit)
            .values(
                pull_request_id=pull_request_id,
                sha=commit_data["sha"],
                message=commit_info.get("message"),
                author_name=author_info.get("name"),
                author_email=author_info.get("email"),
                committed_at=author_info.get("date"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_commit_sha",
                set_={"message": commit_info.get("message")},
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(commits_data)


async def upsert_changed_files(
    session: AsyncSession,
    pull_request_id: int,
    files_data: list[dict[str, Any]],
) -> int:
    """Batch upsert changed files for a PR."""
    if not files_data:
        return 0

    for file_data in files_data:
        stmt = (
            pg_insert(ChangedFile)
            .values(
                pull_request_id=pull_request_id,
                filename=file_data["filename"],
                status=file_data.get("status", "modified"),
                additions=file_data.get("additions", 0),
                deletions=file_data.get("deletions", 0),
                patch=file_data.get("patch"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_file",
                set_={
                    "status": file_data.get("status", "modified"),
                    "additions": file_data.get("additions", 0),
                    "deletions": file_data.get("deletions", 0),
                    "patch": file_data.get("patch"),
                },
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(files_data)


async def upsert_reviews(
    session: AsyncSession,
    pull_request_id: int,
    reviews_data: list[dict[str, Any]],
) -> int:
    """Batch upsert reviews for a PR."""
    if not reviews_data:
        return 0

    for review_data in reviews_data:
        stmt = (
            pg_insert(Review)
            .values(
                pull_request_id=pull_request_id,
                github_review_id=review_data["id"],
                author=review_data.get("user", {}).get("login"),
                state=review_data.get("state", "COMMENTED"),
                body=review_data.get("body"),
                submitted_at=review_data.get("submitted_at"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_review",
                set_={
                    "state": review_data.get("state", "COMMENTED"),
                    "body": review_data.get("body"),
                },
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(reviews_data)


async def upsert_review_comments(
    session: AsyncSession,
    pull_request_id: int,
    comments_data: list[dict[str, Any]],
) -> int:
    """Batch upsert review comments for a PR."""
    if not comments_data:
        return 0

    for comment in comments_data:
        stmt = (
            pg_insert(ReviewComment)
            .values(
                pull_request_id=pull_request_id,
                github_comment_id=comment["id"],
                author=comment.get("user", {}).get("login"),
                body=comment.get("body"),
                path=comment.get("path"),
                diff_hunk=comment.get("diff_hunk"),
                comment_created_at=comment.get("created_at"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_review_comment",
                set_={"body": comment.get("body")},
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(comments_data)


async def upsert_discussion_comments(
    session: AsyncSession,
    pull_request_id: int,
    comments_data: list[dict[str, Any]],
) -> int:
    """Batch upsert discussion (issue-style) comments for a PR."""
    if not comments_data:
        return 0

    for comment in comments_data:
        stmt = (
            pg_insert(DiscussionComment)
            .values(
                pull_request_id=pull_request_id,
                github_comment_id=comment["id"],
                author=comment.get("user", {}).get("login"),
                body=comment.get("body"),
                comment_created_at=comment.get("created_at"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_discussion_comment",
                set_={"body": comment.get("body")},
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(comments_data)


async def upsert_linked_issues(
    session: AsyncSession,
    pull_request_id: int,
    issues_data: list[dict[str, Any]],
) -> int:
    """Batch upsert linked issues for a PR."""
    if not issues_data:
        return 0

    for issue in issues_data:
        labels_list = [label["name"] for label in issue.get("labels", [])]
        stmt = (
            pg_insert(LinkedIssue)
            .values(
                pull_request_id=pull_request_id,
                github_issue_number=issue["number"],
                title=issue.get("title"),
                state=issue.get("state"),
                body=issue.get("body"),
                labels=labels_list,
                html_url=issue.get("html_url"),
            )
            .on_conflict_do_update(
                constraint="uq_pr_linked_issue",
                set_={
                    "title": issue.get("title"),
                    "state": issue.get("state"),
                    "body": issue.get("body"),
                    "labels": labels_list,
                },
            )
        )
        await session.execute(stmt)

    await session.flush()
    return len(issues_data)


# =============================================================================
# PR Knowledge CRUD
# =============================================================================


async def upsert_pr_knowledge(
    session: AsyncSession,
    *,
    pull_request_id: int,
    knowledge_data: dict[str, Any],
    llm_model: str | None = None,
    processing_time_ms: int | None = None,
) -> PRKnowledge:
    """Insert or update LLM-generated knowledge for a PR."""
    values = {
        "pull_request_id": pull_request_id,
        "summary": knowledge_data.get("summary"),
        "motivation": knowledge_data.get("motivation"),
        "components": knowledge_data.get("components"),
        "change_types": knowledge_data.get("change_types"),
        "impact": knowledge_data.get("impact"),
        "architectural_change": knowledge_data.get("architectural_change", False),
        "key_decisions": knowledge_data.get("key_decisions"),
        "review_highlights": knowledge_data.get("review_highlights"),
        "evidence_classification": knowledge_data.get("evidence_classification"),
        "raw_llm_output": knowledge_data,
        "llm_model": llm_model,
        "processing_time_ms": processing_time_ms,
    }

    stmt = (
        pg_insert(PRKnowledge)
        .values(**values)
        .on_conflict_do_update(
            constraint="uq_pr_knowledge",
            set_={k: v for k, v in values.items() if k != "pull_request_id"},
        )
        .returning(PRKnowledge)
    )
    result = await session.execute(stmt)
    knowledge = result.scalar_one()
    await session.flush()
    return knowledge


# =============================================================================
# Engineering Document CRUD
# =============================================================================


async def create_engineering_document(
    session: AsyncSession,
    **kwargs: Any,
) -> EngineeringDocument:
    """Create a new engineering document."""
    doc = EngineeringDocument(**kwargs)
    session.add(doc)
    await session.flush()
    return doc


async def get_documents_by_pr(
    session: AsyncSession, pr_id: int
) -> list[EngineeringDocument]:
    """Get all engineering documents for a PR."""
    result = await session.execute(
        select(EngineeringDocument).where(
            EngineeringDocument.pull_request_id == pr_id
        )
    )
    return list(result.scalars().all())


async def delete_documents_by_pr(
    session: AsyncSession, pr_id: int
) -> None:
    """Delete all engineering documents for a PR (for re-generation)."""
    from sqlalchemy import delete

    await session.execute(
        delete(EngineeringDocument).where(
            EngineeringDocument.pull_request_id == pr_id
        )
    )
    await session.flush()


# =============================================================================
# Sync Log
# =============================================================================


async def create_sync_log(
    session: AsyncSession,
    repository_id: int,
    status: SyncStatus = SyncStatus.PENDING,
) -> SyncLog:
    """Create a new sync log entry."""
    log = SyncLog(repository_id=repository_id, status=status)
    session.add(log)
    await session.flush()
    return log


async def update_sync_log(
    session: AsyncSession,
    sync_log_id: int,
    **kwargs: Any,
) -> None:
    """Update a sync log entry."""
    await session.execute(
        update(SyncLog).where(SyncLog.id == sync_log_id).values(**kwargs)
    )
    await session.flush()
