"""
Engineering Intelligence Platform — Release Notes & Executive Changelog API Routes.

Endpoints for synthesizing merged PRs and engineering decisions into comprehensive,
publication-ready Release Notes and Executive Briefs with live token streaming.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_llm_provider
from app.db.database import get_db_session
from app.db.models import PullRequest, Repository
from app.llm.base import LLMProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/releases", tags=["releases"])


# ── Request / Response Models ───────────────────────────────────────────────


class GenerateReleaseNotesRequest(BaseModel):
    repo_id: int = Field(..., description="Target repository ID")
    limit: int = Field(25, ge=1, le=100, description="Max merged PRs to include")
    from_date: str | None = Field(None, description="Start date (YYYY-MM-DD or ISO)")
    to_date: str | None = Field(None, description="End date (YYYY-MM-DD or ISO)")
    target_audience: str = Field(
        "executive",
        description="Target audience: 'executive', 'engineers', or 'public'",
    )
    release_version: str | None = Field(None, description="Optional release title or version tag")


# ── Helper Functions ────────────────────────────────────────────────────────


async def _fetch_and_prepare_release_data(
    session: AsyncSession,
    request: GenerateReleaseNotesRequest,
) -> tuple[Repository, list[PullRequest], dict[str, Any], str]:
    """Fetch merged PRs and build digest for LLM generation."""
    repo_res = await session.execute(
        select(Repository).where(Repository.id == request.repo_id)
    )
    repo = repo_res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    query = (
        select(PullRequest)
        .options(
            selectinload(PullRequest.knowledge),
            selectinload(PullRequest.commits),
            selectinload(PullRequest.changed_files),
        )
        .where(PullRequest.repository_id == request.repo_id)
        .where(PullRequest.is_merged == True)  # noqa: E712
    )

    # Date filters
    from_dt = None
    to_dt = None
    if request.from_date:
        try:
            from_dt = datetime.fromisoformat(request.from_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if request.to_date:
        try:
            to_dt = datetime.fromisoformat(request.to_date.replace("Z", "+00:00"))
        except Exception:
            pass

    if from_dt:
        query = query.where(
            (PullRequest.github_merged_at >= from_dt)
            | (PullRequest.github_created_at >= from_dt)
        )
    if to_dt:
        query = query.where(
            (PullRequest.github_merged_at <= to_dt)
            | (PullRequest.github_created_at <= to_dt)
        )

    query = query.order_by(
        PullRequest.github_merged_at.desc().nullslast(),
        PullRequest.github_created_at.desc(),
    ).limit(request.limit)

    prs_res = await session.execute(query)
    prs = list(prs_res.scalars().all())

    if not prs:
        raise HTTPException(
            status_code=404,
            detail="No merged pull requests found for the specified repository and date filters.",
        )

    # Compute metrics & stats
    total_additions = sum(pr.additions for pr in prs)
    total_deletions = sum(pr.deletions for pr in prs)
    authors_set = {pr.author for pr in prs if pr.author}
    change_type_counts: dict[str, int] = {}
    components_set: set[str] = set()

    pr_digests: list[str] = []
    for pr in prs:
        ct_list = []
        if pr.knowledge and pr.knowledge.change_types:
            ct_list = pr.knowledge.change_types
            for ct in ct_list:
                change_type_counts[ct] = change_type_counts.get(ct, 0) + 1

        if pr.knowledge and pr.knowledge.components:
            components_set.update(pr.knowledge.components)

        summary = (
            pr.knowledge.summary
            if (pr.knowledge and pr.knowledge.summary)
            else (pr.description[:200] if pr.description else pr.title)
        )
        motivation = (
            pr.knowledge.motivation
            if (pr.knowledge and pr.knowledge.motivation)
            else "Standard enhancement"
        )
        decisions = ""
        if pr.knowledge and pr.knowledge.key_decisions:
            decisions = "; ".join(
                d.get("decision", "") for d in pr.knowledge.key_decisions if isinstance(d, dict)
            )

        pr_digests.append(
            f"- **PR #{pr.github_pr_number}** ({pr.title}) by @{pr.author}:\n"
            f"  * Summary: {summary}\n"
            f"  * Motivation: {motivation}\n"
            f"  * Categories: {', '.join(ct_list) if ct_list else 'general'}\n"
            f"  * Key Decisions: {decisions if decisions else 'None explicitly documented'}\n"
            f"  * Lines: +{pr.additions}/-{pr.deletions}"
        )

    stats = {
        "total_prs": len(prs),
        "total_additions": total_additions,
        "total_deletions": total_deletions,
        "authors_count": len(authors_set),
        "authors": sorted(list(authors_set)),
        "change_types": change_type_counts,
        "components": sorted(list(components_set)),
    }

    # Prompt construction
    version_title = request.release_version or f"Release ({datetime.now().strftime('%B %Y')})"
    audience_instructions = {
        "executive": (
            "Focus on business impact, customer experience, performance velocity, "
            "and operational stability. Keep technical descriptions crisp and value-focused."
        ),
        "engineers": (
            "Provide deep technical depth: architectural trade-offs, internal subsystem changes, "
            "exact API deprecations, compiler changes, and migration details."
        ),
        "public": (
            "Write a polished public changelog suitable for customers and developers on GitHub Releases. "
            "Highlight new capabilities, fixes, and community contributions."
        ),
    }.get(request.target_audience, "Balanced technical and executive summary.")

    prompt = f"""You are a Principal Technical Lead compiling official Release Notes for repository **{repo.full_name}**.
Release: {version_title}
Audience Tone: {request.target_audience.upper()} ({audience_instructions})

Analyzed Merged PRs ({len(prs)} items):
{chr(10).join(pr_digests)}

Generate a publication-ready Release Document in standard Markdown using EXACTLY the following structure:

# {version_title}

## 🎯 Executive Summary & Impact
(High-level overview of the major advancements, reliability improvements, and value delivered in this release cycle)

## ⚠️ Breaking Changes & Migration Notes
(Explicitly list any breaking changes, deprecated flags/APIs, or required code/environment updates. Include PR # citations. If none, output "No breaking changes detected in this release.")

## ⚡ Architecture & Performance Highlights
(Key architectural refactors, speedups, compiler/toolchain bumps, memory optimizations with PR # citations)

## 🚀 Key Features & Capabilities
(New features grouped with concise bullet points, mentioning PR # and author)

## 🐛 Bug Fixes & Reliability Improvements
(Specific bug fixes and edge-case resolutions with PR # and author)

## 🛡️ Maintenance, Dependencies & Tooling
(Dependency upgrades, CI/CD improvements, and maintenance)

## 👥 Contributors & Release Metrics
(Brief recognition of contributors and engineering scope)
"""

    return repo, prs, stats, prompt


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/generate")
async def generate_release_notes(
    request: GenerateReleaseNotesRequest,
    session: AsyncSession = Depends(get_db_session),
    llm: LLMProvider = Depends(get_llm_provider),
) -> Any:
    """Generate comprehensive Release Notes from merged PRs (JSON response)."""
    repo, prs, stats, prompt = await _fetch_and_prepare_release_data(session, request)

    system_prompt = (
        "You are an expert Principal Engineer and Release Engineering Director. "
        "Write clean, elegant, formatted Markdown without any strange formatting artifacts."
    )

    markdown_doc = await llm.generate(prompt, system_prompt=system_prompt)

    return {
        "repo_name": repo.full_name,
        "release_title": request.release_version or f"Release Notes — {repo.name}",
        "markdown": markdown_doc,
        "stats": stats,
        "target_audience": request.target_audience,
        "generated_at": datetime.now().isoformat(),
    }


@router.post("/stream")
async def stream_release_notes(
    request: GenerateReleaseNotesRequest,
    session: AsyncSession = Depends(get_db_session),
    llm: LLMProvider = Depends(get_llm_provider),
) -> Any:
    """Stream Release Notes token-by-token via Server-Sent Events (SSE)."""
    repo, prs, stats, prompt = await _fetch_and_prepare_release_data(session, request)

    system_prompt = (
        "You are an expert Principal Engineer and Release Engineering Director. "
        "Write clean, elegant, formatted Markdown without any strange formatting artifacts."
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial metadata & stats event
        init_payload = json.dumps(
            {
                "type": "init",
                "repo_name": repo.full_name,
                "release_title": request.release_version or f"Release Notes — {repo.name}",
                "stats": stats,
                "target_audience": request.target_audience,
            },
            default=str,
        )
        yield f"data: {init_payload}\n\n"

        # Stream tokens from LLM
        async for chunk in llm.generate_stream(prompt, system_prompt=system_prompt):
            chunk_payload = json.dumps({"type": "token", "token": chunk})
            yield f"data: {chunk_payload}\n\n"

        # Send completion event
        done_payload = json.dumps({"type": "done", "status": "completed"})
        yield f"data: {done_payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
