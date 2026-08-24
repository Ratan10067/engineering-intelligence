"""
Engineering Intelligence Platform — Questions API Routes.

Endpoints for RAG-based question answering with evidence tracking.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_rag_engine
from app.db.database import get_db_session
from app.rag.rag_engine import RAGEngine
from app.retrieval.metadata_filter import MetadataFilters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/questions", tags=["questions"])


class QuestionRequest(BaseModel):
    question: str
    repo_id: int | None = None
    top_k: int = 5
    release: str | None = None
    components: list[str] | None = None
    change_types: list[str] | None = None


class EvidenceItem(BaseModel):
    pr_number: int | None
    title: str
    author: str | None
    date: str | None
    release: str | None
    relevance_score: float
    document_type: str
    components: list[str] | None
    change_types: list[str] | None
    html_url: str | None
    source: str


class QuestionResponse(BaseModel):
    answer: str
    evidence: list[EvidenceItem]
    has_sufficient_evidence: bool
    latency: dict[str, float]
    evidence_tracking: dict[str, Any]
    metadata: dict[str, Any]


@router.post("", response_model=QuestionResponse)
async def ask_question(
    request: QuestionRequest,
    session: AsyncSession = Depends(get_db_session),
    rag_engine: RAGEngine = Depends(get_rag_engine),
) -> Any:
    """
    Ask a natural language question about engineering history.

    Returns an evidence-backed answer with PR citations,
    evidence tracking, and latency metrics.
    """
    filters = None
    if any([request.release, request.components, request.change_types]):
        filters = MetadataFilters(
            release=request.release,
            components=request.components,
            change_types=request.change_types,
            repo_id=request.repo_id,
        )

    response = await rag_engine.ask(
        session,
        request.question,
        repo_id=request.repo_id,
        filters=filters,
        top_k=request.top_k,
    )

    return response.to_dict()


@router.get("/stats")
async def get_stats(
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Get system statistics for the dashboard."""
    from sqlalchemy import select, func
    from app.db.models import (
        Repository, PullRequest, Commit, ChangedFile,
        Review, PRKnowledge, EngineeringDocument,
    )

    # Count all entities
    repos = (await session.execute(select(func.count()).select_from(Repository))).scalar_one()
    prs = (await session.execute(select(func.count()).select_from(PullRequest))).scalar_one()
    commits = (await session.execute(select(func.count()).select_from(Commit))).scalar_one()
    files = (await session.execute(select(func.count()).select_from(ChangedFile))).scalar_one()
    reviews = (await session.execute(select(func.count()).select_from(Review))).scalar_one()
    knowledge = (await session.execute(select(func.count()).select_from(PRKnowledge))).scalar_one()
    documents = (await session.execute(select(func.count()).select_from(EngineeringDocument))).scalar_one()

    return {
        "repositories": repos,
        "pull_requests": prs,
        "commits": commits,
        "changed_files": files,
        "reviews": reviews,
        "prs_with_knowledge": knowledge,
        "engineering_documents": documents,
    }
