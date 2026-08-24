"""
Engineering Intelligence Platform — Search API Routes.

Endpoints for hybrid search across engineering documents.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_hybrid_retriever
from app.db.database import get_db_session
from app.retrieval.hybrid_retriever import HybridRetriever
from app.retrieval.metadata_filter import MetadataFilters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    repo_id: int | None = None
    top_k: int = 10
    release: str | None = None
    components: list[str] | None = None
    change_types: list[str] | None = None
    author: str | None = None
    file_pattern: str | None = None
    date_from: str | None = None
    date_to: str | None = None


class SearchResultItem(BaseModel):
    document_id: int
    pull_request_id: int
    document_type: str
    title: str
    content: str
    score: float
    pr_number: int | None
    author: str | None
    pr_date: str | None
    release: str | None
    components: list[str] | None
    change_types: list[str] | None
    html_url: str | None
    source: str


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    query: str


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    session: AsyncSession = Depends(get_db_session),
    retriever: HybridRetriever = Depends(get_hybrid_retriever),
) -> Any:
    """
    Perform hybrid search across engineering documents.

    Combines semantic (vector) search, keyword (full-text) search,
    and metadata filtering with Reciprocal Rank Fusion.
    """
    filters = None
    if any([
        request.release, request.components, request.change_types,
        request.author, request.file_pattern,
        request.date_from, request.date_to,
    ]):
        filters = MetadataFilters(
            release=request.release,
            components=request.components,
            change_types=request.change_types,
            author=request.author,
            file_pattern=request.file_pattern,
            date_from=datetime.fromisoformat(request.date_from) if request.date_from else None,
            date_to=datetime.fromisoformat(request.date_to) if request.date_to else None,
            repo_id=request.repo_id,
        )

    results = await retriever.search(
        session,
        request.query,
        filters=filters,
        top_k=request.top_k,
        repo_id=request.repo_id,
    )

    return {
        "results": [
            {
                "document_id": r.document_id,
                "pull_request_id": r.pull_request_id,
                "document_type": r.document_type,
                "title": r.title,
                "content": r.content[:500],  # Truncate for list view
                "score": round(r.score, 4),
                "pr_number": r.pr_number,
                "author": r.author,
                "pr_date": r.pr_date,
                "release": r.release,
                "components": r.components,
                "change_types": r.change_types,
                "html_url": r.html_url,
                "source": r.source,
            }
            for r in results
        ],
        "total": len(results),
        "query": request.query,
    }
