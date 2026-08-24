"""
Engineering Intelligence Platform — Context Builder.

Builds structured LLM context from retrieved evidence documents.
Enriches search results with original PR data, reviews, and commits
for comprehensive answer generation.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import PullRequest
from app.retrieval.vector_search import SearchResult

logger = logging.getLogger(__name__)

# Maximum context size (characters)
MAX_CONTEXT_CHARS = 12000


class ContextBuilder:
    """
    Builds structured context for the RAG LLM prompt.

    Takes the top-ranked search results and enriches them with
    original PR data to provide comprehensive evidence context.
    """

    async def build_context(
        self,
        session: AsyncSession,
        results: list[SearchResult],
        query: str,
    ) -> str:
        """
        Build a structured context string from search results.

        Returns a formatted context string ready for the LLM prompt.
        """
        if not results:
            return "No relevant engineering documents were found."

        # Collect unique PR IDs
        pr_ids = list({r.pull_request_id for r in results})

        # Load PR data
        pr_result = await session.execute(
            select(PullRequest)
            .options(
                selectinload(PullRequest.commits),
                selectinload(PullRequest.changed_files),
                selectinload(PullRequest.reviews),
                selectinload(PullRequest.knowledge),
            )
            .where(PullRequest.id.in_(pr_ids))
        )
        prs = {pr.id: pr for pr in pr_result.scalars().all()}

        # Build context sections
        sections = []
        sections.append("# Retrieved Engineering Evidence\n")
        sections.append(f"Query: {query}\n")
        sections.append(f"Found {len(results)} relevant documents across {len(prs)} PRs.\n")

        chars_used = 0
        for idx, result in enumerate(results):
            if chars_used >= MAX_CONTEXT_CHARS:
                sections.append(f"\n[{len(results) - idx} more results omitted due to context limit]")
                break

            pr = prs.get(result.pull_request_id)
            section = self._format_evidence_section(idx + 1, result, pr)
            chars_used += len(section)
            sections.append(section)

        return "\n".join(sections)

    def _format_evidence_section(
        self,
        rank: int,
        result: SearchResult,
        pr: PullRequest | None,
    ) -> str:
        """Format a single evidence section for the context."""
        parts = []
        parts.append(f"\n---\n## Evidence {rank} (Relevance: {result.score:.3f})")
        parts.append(f"**Document Type:** {result.document_type}")
        parts.append(f"**PR #{result.pr_number}:** {result.title}")

        if result.author:
            parts.append(f"**Author:** {result.author}")
        if result.pr_date:
            parts.append(f"**Date:** {result.pr_date}")
        if result.release:
            parts.append(f"**Release:** {result.release}")
        if result.components:
            parts.append(f"**Components:** {', '.join(result.components)}")
        if result.change_types:
            parts.append(f"**Change Types:** {', '.join(result.change_types)}")
        if result.html_url:
            parts.append(f"**GitHub URL:** {result.html_url}")

        # Document content
        content = result.content[:2000]  # Limit per document
        parts.append(f"\n### Content\n{content}")

        # Add PR enrichment if available
        if pr:
            # Key commits
            if pr.commits:
                parts.append("\n### Key Commits")
                for c in pr.commits[:5]:
                    msg = (c.message or "").split("\n")[0][:150]
                    parts.append(f"- `{c.sha[:8]}`: {msg}")

            # Changed files summary
            if pr.changed_files:
                parts.append(
                    f"\n### Changed Files ({pr.changed_files_count} total, "
                    f"+{pr.additions}/-{pr.deletions})"
                )
                for f in pr.changed_files[:10]:
                    parts.append(f"- {f.filename} ({f.status})")

            # Knowledge summary
            if pr.knowledge:
                if pr.knowledge.motivation:
                    parts.append(f"\n### Motivation\n{pr.knowledge.motivation}")
                if pr.knowledge.key_decisions:
                    parts.append("\n### Key Decisions")
                    for dec in pr.knowledge.key_decisions:
                        if isinstance(dec, dict):
                            parts.append(
                                f"- {dec.get('decision', 'N/A')} "
                                f"[{dec.get('evidence_type', 'UNKNOWN')}]"
                            )

            # Important reviews
            if pr.reviews:
                substantive = [r for r in pr.reviews if r.body and len(r.body) > 50]
                if substantive:
                    parts.append("\n### Review Highlights")
                    for r in substantive[:3]:
                        body = r.body[:300] if r.body else ""
                        parts.append(f"- **{r.author}** ({r.state}): {body}")

        return "\n".join(parts)

    def build_evidence_summary(
        self, results: list[SearchResult]
    ) -> list[dict[str, Any]]:
        """
        Build a structured evidence summary for the response.

        Returns a list of evidence items with PR links and metadata.
        """
        evidence_items = []
        seen_prs: set[int] = set()

        for result in results:
            pr_num = result.pr_number
            if pr_num and pr_num not in seen_prs:
                seen_prs.add(pr_num)
                evidence_items.append({
                    "pr_number": pr_num,
                    "title": result.title,
                    "author": result.author,
                    "date": result.pr_date,
                    "release": result.release,
                    "relevance_score": round(result.score, 3),
                    "document_type": result.document_type,
                    "components": result.components,
                    "change_types": result.change_types,
                    "html_url": result.html_url,
                    "source": result.source,
                })

        return evidence_items
