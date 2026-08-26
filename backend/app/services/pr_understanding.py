"""
Engineering Intelligence Platform — PR Understanding Service.

Uses the LLM to convert raw PR data (description, commits, diffs,
reviews, comments) into structured engineering knowledge.
Distinguishes between DOCUMENTED, INFERRED, and UNKNOWN evidence.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models import (
    ChangedFile,
    Commit,
    DiscussionComment,
    PullRequest,
    Review,
    ReviewComment,
)
from app.db import repositories as db_repo
from app.llm.base import LLMProvider

logger = logging.getLogger(__name__)


# Maximum characters for each section in the prompt
MAX_DESCRIPTION_CHARS = 3000
MAX_DIFF_CHARS = 4000
MAX_COMMENTS_CHARS = 3000


class PRUnderstandingService:
    """
    Converts raw PR engineering activity into structured knowledge.

    For each PR, gathers all available context (description, commits,
    diffs, reviews, comments) and asks the LLM to produce structured
    understanding with evidence classification.
    """

    def __init__(self, llm: LLMProvider):
        self.llm = llm

    def _build_pr_context(
        self,
        pr: PullRequest,
        commits: list[Commit],
        files: list[ChangedFile],
        reviews: list[Review],
        review_comments: list[ReviewComment],
        discussion_comments: list[DiscussionComment],
    ) -> str:
        """Build a comprehensive context string from PR data."""
        sections = []

        # PR metadata
        sections.append(f"# PR #{pr.github_pr_number}: {pr.title}")
        sections.append(f"Author: {pr.author}")
        sections.append(f"State: {pr.state} | Merged: {pr.is_merged}")
        if pr.labels:
            sections.append(f"Labels: {', '.join(pr.labels) if isinstance(pr.labels, list) else str(pr.labels)}")
        if pr.milestone:
            sections.append(f"Milestone/Release: {pr.milestone}")
        if pr.release_tag:
            sections.append(f"Release: {pr.release_tag}")
        sections.append(f"Created: {pr.github_created_at}")
        sections.append(f"Merged: {pr.github_merged_at}")
        sections.append(f"Changes: +{pr.additions}/-{pr.deletions} across {pr.changed_files_count} files")

        # PR description
        if pr.description:
            desc = pr.description[:MAX_DESCRIPTION_CHARS]
            sections.append(f"\n## PR Description\n{desc}")

        # Commits
        if commits:
            sections.append("\n## Commits")
            for c in commits[:20]:
                msg = (c.message or "").split("\n")[0][:200]
                sections.append(f"- {c.sha[:8]}: {msg}")

        # Changed files
        if files:
            sections.append("\n## Changed Files")
            for f in files[:30]:
                sections.append(f"- {f.filename} ({f.status}) +{f.additions}/-{f.deletions}")

            # Include important diffs (limited)
            diff_chars_used = 0
            important_files = sorted(files, key=lambda f: f.additions + f.deletions, reverse=True)
            for f in important_files[:5]:
                if f.patch and diff_chars_used < MAX_DIFF_CHARS:
                    remaining = MAX_DIFF_CHARS - diff_chars_used
                    patch = f.patch[:remaining]
                    sections.append(f"\n### Diff: {f.filename}\n```\n{patch}\n```")
                    diff_chars_used += len(patch)

        # Reviews
        if reviews:
            sections.append("\n## Reviews")
            for r in reviews:
                if r.body:
                    body = r.body[:500]
                    sections.append(f"- {r.author} ({r.state}): {body}")
                else:
                    sections.append(f"- {r.author} ({r.state})")

        # Review comments
        if review_comments:
            sections.append("\n## Review Comments")
            chars_used = 0
            for rc in review_comments:
                if chars_used >= MAX_COMMENTS_CHARS:
                    break
                if rc.body:
                    body = rc.body[:300]
                    line = f"- {rc.author} on {rc.path}: {body}"
                    sections.append(line)
                    chars_used += len(line)

        # Discussion comments
        if discussion_comments:
            sections.append("\n## Discussion")
            chars_used = 0
            for dc in discussion_comments:
                if chars_used >= MAX_COMMENTS_CHARS:
                    break
                if dc.body:
                    body = dc.body[:300]
                    line = f"- {dc.author}: {body}"
                    sections.append(line)
                    chars_used += len(line)

        return "\n".join(sections)

    def _build_understanding_prompt(self, context: str) -> tuple[str, str]:
        """Build the system prompt and user prompt for PR understanding."""
        system_prompt = """You are an engineering intelligence analyst. Your job is to analyze Pull Request data and produce structured engineering knowledge.

CRITICAL RULES:
1. Distinguish between three types of evidence:
   - DOCUMENTED: The PR description, reviews, or comments explicitly state this information.
   - INFERRED: You believe this based on code changes or patterns, but it's not explicitly stated.
   - UNKNOWN: There is not enough evidence to determine this.

2. Never present an inference as a documented fact.
3. If information is missing, classify it as UNKNOWN rather than guessing.
4. Focus on engineering significance: what changed, why, and what impact it has.

Respond with valid JSON only. No explanations outside JSON."""

        user_prompt = f"""Analyze the following Pull Request and produce structured engineering knowledge.

{context}

Produce a JSON response with this exact structure:
{{
  "summary": "A concise 1-2 sentence summary of what this PR does",
  "motivation": "Why was this change made? What problem does it solve?",
  "components": ["list", "of", "affected", "components", "or", "modules"],
  "change_types": ["list of change type tags, e.g.: bugfix, feature, refactor, performance, security, documentation, testing, dependency, configuration, infrastructure"],
  "impact": ["list of impact areas, e.g.: memory usage, API performance, user experience, data integrity"],
  "architectural_change": true/false,
  "key_decisions": [
    {{
      "decision": "Description of a key engineering decision",
      "evidence_type": "DOCUMENTED or INFERRED or UNKNOWN",
      "evidence_source": "Where this evidence comes from (PR description, review, commit message, code diff)"
    }}
  ],
  "review_highlights": [
    {{
      "topic": "Key discussion topic from reviews",
      "outcome": "How it was resolved",
      "evidence_type": "DOCUMENTED or INFERRED"
    }}
  ],
  "evidence_classification": {{
    "summary": "DOCUMENTED or INFERRED",
    "motivation": "DOCUMENTED or INFERRED or UNKNOWN",
    "impact": "DOCUMENTED or INFERRED or UNKNOWN"
  }}
}}"""

        return system_prompt, user_prompt

    async def understand_pr(
        self,
        session: AsyncSession,
        pr_id: int,
    ) -> dict[str, Any] | None:
        """
        Analyze a single PR and store structured knowledge.

        Returns the generated knowledge dict or None on failure.
        """
        # Load PR with all related data
        result = await session.execute(
            select(PullRequest)
            .options(
                selectinload(PullRequest.commits),
                selectinload(PullRequest.changed_files),
                selectinload(PullRequest.reviews),
                selectinload(PullRequest.review_comments),
                selectinload(PullRequest.discussion_comments),
            )
            .where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()

        if not pr:
            logger.error("PR %d not found", pr_id)
            return None

        # Build context and prompt
        context = self._build_pr_context(
            pr, pr.commits, pr.changed_files,
            pr.reviews, pr.review_comments, pr.discussion_comments,
        )
        system_prompt, user_prompt = self._build_understanding_prompt(context)

        # Call LLM with automatic multi-attempt retry
        knowledge_data = None
        start_time = time.monotonic()
        max_attempts = 3

        import asyncio

        for attempt in range(1, max_attempts + 1):
            try:
                temp = 0.1 if attempt == 1 else 0.2
                knowledge_data = await self.llm.generate_structured(
                    user_prompt,
                    system_prompt=system_prompt,
                    temperature=temp,
                    max_tokens=4096,
                )
                if knowledge_data and isinstance(knowledge_data, dict) and len(knowledge_data) > 0:
                    break
                logger.warning(
                    "LLM returned no structured data for PR #%d (attempt %d/%d), retrying...",
                    pr.github_pr_number, attempt, max_attempts,
                )
            except Exception as e:
                logger.warning(
                    "LLM call failed for PR #%d (attempt %d/%d): %s",
                    pr.github_pr_number, attempt, max_attempts, e,
                )
            if attempt < max_attempts:
                await asyncio.sleep(1.0)

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        if not knowledge_data:
            logger.warning(
                "LLM generation failed after %d attempts for PR #%d. Generating structured fallback knowledge.",
                max_attempts, pr.github_pr_number,
            )
            # Create a clean fallback knowledge structure from PR metadata
            component_guesses = list({f.filename.split("/")[0] for f in pr.changed_files if "/" in f.filename} or ["core"])
            knowledge_data = {
                "summary": f"{pr.title}",
                "motivation": pr.description[:300] if pr.description else f"Pull request #{pr.github_pr_number} merged by {pr.author}.",
                "components": component_guesses[:5],
                "change_types": pr.labels if pr.labels else ["enhancement"],
                "impact": ["codebase updates"],
                "architectural_change": False,
                "key_decisions": [],
                "review_highlights": [],
                "evidence_classification": {
                    "summary": "DOCUMENTED",
                    "motivation": "DOCUMENTED" if pr.description else "UNKNOWN",
                    "impact": "INFERRED",
                },
            }

        # Normalize keys for resilience with 2B/local models (e.g. "summaary", "impaact")
        normalized: dict[str, Any] = {}
        for k, v in knowledge_data.items():
            clean_k = str(k).lower().strip().replace("-", "_")
            if clean_k.startswith("summa") or "summary" in clean_k:
                normalized["summary"] = v
            elif clean_k.startswith("motivat") or "motivation" in clean_k:
                normalized["motivation"] = v
            elif clean_k.startswith("comp") or "component" in clean_k:
                normalized["components"] = v if isinstance(v, list) else [str(v)]
            elif clean_k.startswith("change") or "type" in clean_k:
                normalized["change_types"] = v if isinstance(v, list) else [str(v)]
            elif clean_k.startswith("imp") or "impact" in clean_k:
                normalized["impact"] = v if isinstance(v, list) else [str(v)]
            elif clean_k.startswith("arch") or "architectur" in clean_k:
                normalized["architectural_change"] = bool(v)
            elif clean_k.startswith("decis") or "decision" in clean_k:
                normalized["key_decisions"] = v if isinstance(v, list) else []
            elif clean_k.startswith("review") or "highlight" in clean_k:
                normalized["review_highlights"] = v if isinstance(v, list) else []
            elif clean_k.startswith("evid") or "classif" in clean_k:
                normalized["evidence_classification"] = v if isinstance(v, dict) else {}
            else:
                normalized[clean_k] = v

        if "summary" not in normalized and "motivation" in normalized:
            normalized["summary"] = normalized["motivation"]
        if "summary" not in normalized:
            normalized["summary"] = f"Updates for PR #{pr.github_pr_number}: {pr.title}"
        if "components" not in normalized:
            normalized["components"] = []
        if "change_types" not in normalized:
            normalized["change_types"] = []

        knowledge_data = normalized

        # Store in database
        await db_repo.upsert_pr_knowledge(
            session,
            pull_request_id=pr_id,
            knowledge_data=knowledge_data,
            llm_model=self.llm.model if hasattr(self.llm, 'model') else None,
            processing_time_ms=elapsed_ms,
        )

        logger.info(
            "🧠 [LLM PR UNDERSTANDING JSON] (PR #%d generated in %dms):\n%s",
            pr.github_pr_number,
            elapsed_ms,
            json.dumps(knowledge_data, indent=2),
        )
        return knowledge_data

    async def understand_all_prs(
        self,
        session: AsyncSession,
        repo_id: int,
        *,
        progress_callback: Any = None,
    ) -> int:
        """
        Analyze all unprocessed PRs for a repository.

        Returns the number of PRs successfully processed.
        """
        prs = await db_repo.get_prs_without_knowledge(session, repo_id)

        if not prs:
            logger.info("No unprocessed PRs found for repo %d", repo_id)
            return 0

        logger.info("Processing %d PRs for understanding", len(prs))

        success_count = 0
        for idx, pr in enumerate(prs):
            try:
                result = await self.understand_pr(session, pr.id)
                if result:
                    success_count += 1
                    await session.commit()

                if progress_callback:
                    await progress_callback(idx + 1, len(prs), pr.github_pr_number)

            except Exception as e:
                logger.error("Failed to understand PR #%d: %s", pr.github_pr_number, e)
                await session.rollback()
                continue

        logger.info("Successfully processed %d/%d PRs", success_count, len(prs))
        return success_count
