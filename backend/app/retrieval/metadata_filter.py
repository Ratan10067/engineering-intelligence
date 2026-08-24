"""
Engineering Intelligence Platform — Metadata Filter.

Implements structured metadata filtering for engineering documents.
Supports filtering by release, component, change type, file,
author, date range, and more.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.retrieval.vector_search import SearchResult

logger = logging.getLogger(__name__)


@dataclass
class MetadataFilters:
    """Structured filters for metadata-based search."""

    release: str | None = None
    components: list[str] | None = None
    change_types: list[str] | None = None
    author: str | None = None
    file_pattern: str | None = None
    pr_number: int | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    document_types: list[str] | None = None
    labels: list[str] | None = None
    repo_id: int | None = None

    def has_filters(self) -> bool:
        """Check if any filters are set."""
        return any([
            self.release, self.components, self.change_types,
            self.author, self.file_pattern, self.pr_number,
            self.date_from, self.date_to, self.document_types,
            self.labels, self.repo_id,
        ])


class MetadataFilter:
    """
    Structured metadata filtering for engineering documents.

    Generates SQL WHERE clauses from MetadataFilters and
    queries the engineering_documents table.
    """

    async def search(
        self,
        session: AsyncSession,
        filters: MetadataFilters,
        *,
        top_k: int = 20,
    ) -> list[SearchResult]:
        """
        Filter engineering documents by metadata.

        Args:
            session: Database session
            filters: Structured filter criteria
            top_k: Maximum results to return
        """
        if not filters.has_filters():
            return []

        conditions = []
        params: dict[str, Any] = {"top_k": top_k}

        if filters.repo_id:
            conditions.append("pr.repository_id = :repo_id")
            params["repo_id"] = filters.repo_id

        if filters.release:
            conditions.append("ed.release = :release")
            params["release"] = filters.release

        if filters.author:
            conditions.append("ed.author = :author")
            params["author"] = filters.author

        if filters.pr_number:
            conditions.append("ed.pr_number = :pr_number")
            params["pr_number"] = filters.pr_number

        if filters.date_from:
            conditions.append("ed.pr_date >= :date_from")
            params["date_from"] = filters.date_from

        if filters.date_to:
            conditions.append("ed.pr_date <= :date_to")
            params["date_to"] = filters.date_to

        if filters.components:
            conditions.append("ed.components ?| :components")
            params["components"] = filters.components

        if filters.change_types:
            conditions.append("ed.change_types ?| :change_types")
            params["change_types"] = filters.change_types

        if filters.labels:
            conditions.append("ed.labels ?| :labels")
            params["labels"] = filters.labels

        if filters.document_types:
            conditions.append("ed.document_type = ANY(:document_types)")
            params["document_types"] = filters.document_types

        if filters.file_pattern:
            conditions.append("ed.content ILIKE :file_pattern")
            params["file_pattern"] = f"%{filters.file_pattern}%"

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

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
                1.0 as match_score
            FROM engineering_documents ed
            JOIN pull_requests pr ON ed.pull_request_id = pr.id
            WHERE {where_clause}
            ORDER BY ed.pr_date DESC NULLS LAST
            LIMIT :top_k
        """

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
                    score=1.0,
                    pr_number=row.pr_number,
                    author=row.author,
                    pr_date=row.pr_date,
                    release=row.release,
                    components=row.components,
                    change_types=row.change_types,
                    html_url=row.html_url,
                    source="metadata",
                )
            )

        logger.info("Metadata filter returned %d results", len(results))
        return results
