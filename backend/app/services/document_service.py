"""
Engineering Intelligence Platform — Document Service.

Creates searchable engineering documents from PR knowledge.
Each PR produces multiple document types optimized for different
search scenarios. Documents include metadata for filtering and
full-text search vectors.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    DocumentType,
    EngineeringDocument,
    PRKnowledge,
    PullRequest,
)
from app.db import repositories as db_repo

logger = logging.getLogger(__name__)


class DocumentService:
    """
    Creates meaningful engineering documents from structured PR knowledge.

    Document types:
    - PR_SUMMARY: High-level summary of the PR's engineering significance
    - PR_DESCRIPTION: Original PR description (if substantial)
    - REVIEW_DISCUSSION: Important review discussions
    - FILE_CHANGE_SUMMARY: Summary of file-level changes
    - ARCHITECTURE_DECISION: Architectural decisions documented in the PR
    - ISSUE_FIX: Issue/bug fix description
    """

    def _build_metadata(
        self, pr: PullRequest, knowledge: PRKnowledge | None
    ) -> dict[str, Any]:
        """Build common metadata dict for a document."""
        meta: dict[str, Any] = {
            "repository_name": None,
            "pr_number": pr.github_pr_number,
            "author": pr.author,
            "pr_date": pr.github_merged_at or pr.github_created_at,
            "release": pr.release_tag or pr.milestone,
            "labels": pr.labels,
        }

        if knowledge:
            meta["components"] = knowledge.components
            meta["change_types"] = knowledge.change_types
            meta["files"] = [f.filename for f in pr.changed_files] if pr.changed_files else None

        return meta

    async def create_documents_for_pr(
        self,
        session: AsyncSession,
        pr_id: int,
    ) -> list[EngineeringDocument]:
        """
        Generate all engineering documents for a single PR.

        Deletes existing documents for the PR first (idempotent).
        """
        # Load PR with knowledge and files
        result = await session.execute(
            select(PullRequest)
            .options(
                selectinload(PullRequest.knowledge),
                selectinload(PullRequest.changed_files),
                selectinload(PullRequest.reviews),
                selectinload(PullRequest.review_comments),
                selectinload(PullRequest.linked_issues),
            )
            .where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()

        if not pr:
            logger.error("PR %d not found", pr_id)
            return []

        knowledge = pr.knowledge

        # Delete existing documents (for re-generation)
        await db_repo.delete_documents_by_pr(session, pr_id)

        documents = []
        metadata = self._build_metadata(pr, knowledge)

        # --- 1. PR Summary Document ---
        if knowledge and knowledge.summary:
            content_parts = [
                f"PR #{pr.github_pr_number}: {pr.title}",
                f"\nSummary: {knowledge.summary}",
            ]
            if knowledge.motivation:
                content_parts.append(f"\nMotivation: {knowledge.motivation}")
            if knowledge.components:
                content_parts.append(f"\nComponents: {', '.join(knowledge.components)}")
            if knowledge.change_types:
                content_parts.append(f"\nChange Types: {', '.join(knowledge.change_types)}")
            if knowledge.impact:
                impacts = knowledge.impact if isinstance(knowledge.impact, list) else [str(knowledge.impact)]
                content_parts.append(f"\nImpact: {', '.join(impacts)}")
            if knowledge.architectural_change:
                content_parts.append("\nThis PR introduces architectural changes.")

            doc = await db_repo.create_engineering_document(
                session,
                pull_request_id=pr_id,
                document_type=DocumentType.PR_SUMMARY,
                title=f"PR #{pr.github_pr_number}: {pr.title}",
                content="\n".join(content_parts),
                **metadata,
            )
            documents.append(doc)

        # --- 2. PR Description Document ---
        if pr.description and len(pr.description.strip()) > 100:
            doc = await db_repo.create_engineering_document(
                session,
                pull_request_id=pr_id,
                document_type=DocumentType.PR_DESCRIPTION,
                title=f"PR #{pr.github_pr_number} Description",
                content=f"PR #{pr.github_pr_number}: {pr.title}\n\n{pr.description}",
                **metadata,
            )
            documents.append(doc)

        # --- 3. Review Discussion Documents ---
        important_reviews = [
            r for r in (pr.reviews or [])
            if r.body and len(r.body.strip()) > 50
        ]
        if important_reviews:
            review_parts = [f"Review discussion for PR #{pr.github_pr_number}: {pr.title}"]
            for r in important_reviews:
                review_parts.append(f"\n{r.author} ({r.state}):\n{r.body}")

            # Add inline review comments
            for rc in (pr.review_comments or [])[:10]:
                if rc.body and len(rc.body.strip()) > 20:
                    review_parts.append(f"\nInline comment by {rc.author} on {rc.path}:\n{rc.body}")

            doc = await db_repo.create_engineering_document(
                session,
                pull_request_id=pr_id,
                document_type=DocumentType.REVIEW_DISCUSSION,
                title=f"Review Discussion: PR #{pr.github_pr_number}",
                content="\n".join(review_parts),
                **metadata,
            )
            documents.append(doc)

        # --- 4. File Change Summary ---
        if pr.changed_files and len(pr.changed_files) > 0:
            file_parts = [
                f"Files changed in PR #{pr.github_pr_number}: {pr.title}",
                f"Total: {pr.changed_files_count} files, +{pr.additions}/-{pr.deletions}",
            ]
            for f in pr.changed_files[:30]:
                file_parts.append(f"\n- {f.filename} ({f.status}): +{f.additions}/-{f.deletions}")

            doc = await db_repo.create_engineering_document(
                session,
                pull_request_id=pr_id,
                document_type=DocumentType.FILE_CHANGE_SUMMARY,
                title=f"File Changes: PR #{pr.github_pr_number}",
                content="\n".join(file_parts),
                **metadata,
            )
            documents.append(doc)

        # --- 5. Architecture Decision ---
        if knowledge and knowledge.architectural_change and knowledge.key_decisions:
            decision_parts = [
                f"Architecture decisions in PR #{pr.github_pr_number}: {pr.title}",
            ]
            for dec in knowledge.key_decisions:
                if isinstance(dec, dict):
                    decision_parts.append(
                        f"\nDecision: {dec.get('decision', 'N/A')}"
                        f"\nEvidence: {dec.get('evidence_type', 'UNKNOWN')}"
                        f"\nSource: {dec.get('evidence_source', 'N/A')}"
                    )

            doc = await db_repo.create_engineering_document(
                session,
                pull_request_id=pr_id,
                document_type=DocumentType.ARCHITECTURE_DECISION,
                title=f"Architecture Decision: PR #{pr.github_pr_number}",
                content="\n".join(decision_parts),
                **metadata,
            )
            documents.append(doc)

        # --- 6. Issue Fix ---
        if pr.linked_issues:
            for issue in pr.linked_issues:
                issue_parts = [
                    f"Issue #{issue.github_issue_number} fixed by PR #{pr.github_pr_number}: {pr.title}",
                ]
                if issue.title:
                    issue_parts.append(f"Issue: {issue.title}")
                if issue.body:
                    issue_parts.append(f"Details: {issue.body[:1000]}")
                if knowledge and knowledge.summary:
                    issue_parts.append(f"Fix: {knowledge.summary}")

                doc = await db_repo.create_engineering_document(
                    session,
                    pull_request_id=pr_id,
                    document_type=DocumentType.ISSUE_FIX,
                    title=f"Fix for Issue #{issue.github_issue_number}",
                    content="\n".join(issue_parts),
                    **metadata,
                )
                documents.append(doc)

        # Update full-text search vectors
        if documents:
            await session.flush()
            for doc in documents:
                await session.execute(
                    text(
                        "UPDATE engineering_documents "
                        "SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')) "
                        "WHERE id = :doc_id"
                    ),
                    {"doc_id": doc.id},
                )

        await session.flush()
        logger.info(
            "Created %d documents for PR #%d", len(documents), pr.github_pr_number
        )
        return documents

    async def create_documents_for_repo(
        self,
        session: AsyncSession,
        repo_id: int,
        *,
        progress_callback: Any = None,
    ) -> int:
        """
        Generate engineering documents for all PRs with knowledge in a repo.

        Returns the total number of documents created.
        """
        # Get all PRs in repo
        result = await session.execute(
            select(PullRequest)
            .outerjoin(PRKnowledge)
            .where(PullRequest.repository_id == repo_id)
            .order_by(PullRequest.github_pr_number)
        )
        prs = list(result.scalars().all())

        if not prs:
            logger.info("No PRs found for repo %d", repo_id)
            return 0

        total_docs = 0
        for idx, pr in enumerate(prs):
            try:
                docs = await self.create_documents_for_pr(session, pr.id)
                total_docs += len(docs)
                await session.commit()

                if progress_callback:
                    await progress_callback(idx + 1, len(prs), pr.github_pr_number)

            except Exception as e:
                logger.error(
                    "Failed to create documents for PR #%d: %s",
                    pr.github_pr_number,
                    e,
                )
                await session.rollback()
                continue

        logger.info(
            "Created %d documents for %d PRs in repo %d",
            total_docs, len(prs), repo_id,
        )
        return total_docs
