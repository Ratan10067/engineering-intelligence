"""
Engineering Intelligence Platform — Keyword Search.

Implements full-text search using PostgreSQL tsvector/tsquery
with ranking via ts_rank_cd.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.retrieval.vector_search import SearchResult

logger = logging.getLogger(__name__)


class KeywordSearch:
    """
    Full-text keyword search using PostgreSQL tsvector.

    Handles exact identifiers (file names, PR numbers, release tags)
    that semantic search may miss.
    """

    def _sanitize_query(self, query: str) -> str:
        """Convert user query into a valid tsquery string."""
        # Remove special characters that break tsquery
        cleaned = re.sub(r"[^\w\s#.-]", " ", query)

        # Split into words
        words = cleaned.split()

        # Filter out very short words
        words = [w for w in words if len(w) > 1]

        if not words:
            return ""

        # Join with & (AND) operator for tsquery
        return " & ".join(words)

    async def search(
        self,
        session: AsyncSession,
        query: str,
        *,
        top_k: int = 10,
        repo_id: int | None = None,
    ) -> list[SearchResult]:
        """
        Perform full-text search using PostgreSQL tsvector.

        Args:
            session: Database session
            query: Search query (natural language or keywords)
            top_k: Number of results to return
            repo_id: Optional filter by repository
        """
        tsquery = self._sanitize_query(query)
        if not tsquery:
            return []

        sql = f"""
            SELECT
                ed.id as document_id,
                ed.pull_request_id,
                ed.document_type,
                ed.title,
                ed.content,
                ed.pr_number,
                ed.author,
                ed.pr_date::text,
                ed.release,
                ed.components,
                ed.change_types,
                pr.html_url,
                ts_rank_cd(ed.search_vector, plainto_tsquery('english', :raw_query)) as rank_score
            FROM engineering_documents ed
            JOIN pull_requests pr ON ed.pull_request_id = pr.id
            WHERE ed.search_vector @@ plainto_tsquery('english', :raw_query)
            {"AND pr.repository_id = :repo_id" if repo_id else ""}
            ORDER BY rank_score DESC
            LIMIT :top_k
        """

        params: dict[str, Any] = {
            "raw_query": query,
            "top_k": top_k,
        }
        if repo_id:
            params["repo_id"] = repo_id

        result = await session.execute(text(sql), params)
        rows = result.fetchall()

        results = []
        for row in rows:
            results.append(
                SearchResult(
                    document_id=row.document_id,
                    pull_request_id=row.pull_request_id,
                    document_type=row.document_type,
                    title=row.title,
                    content=row.content,
                    score=float(row.rank_score) if row.rank_score else 0.0,
                    pr_number=row.pr_number,
                    author=row.author,
                    pr_date=row.pr_date,
                    release=row.release,
                    components=row.components,
                    change_types=row.change_types,
                    html_url=row.html_url,
                    source="keyword",
                )
            )

        logger.info(
            "Keyword search for '%s' returned %d results",
            query[:50],
            len(results),
        )
        return results
