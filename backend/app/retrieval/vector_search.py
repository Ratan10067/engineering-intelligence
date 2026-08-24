"""
Engineering Intelligence Platform — Vector Search.

Implements semantic search using pgvector cosine similarity.
Converts queries to embeddings and finds nearest neighbors.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """A single search result with metadata."""

    document_id: int
    pull_request_id: int
    document_type: str
    title: str
    content: str
    score: float
    pr_number: int | None = None
    author: str | None = None
    pr_date: str | None = None
    release: str | None = None
    components: list[str] | None = None
    change_types: list[str] | None = None
    html_url: str | None = None
    source: str = "vector"  # vector, keyword, metadata
    metadata: dict[str, Any] = field(default_factory=dict)


class VectorSearch:
    """
    Semantic search using pgvector cosine similarity.

    Converts a text query into an embedding and finds the most
    semantically similar engineering documents.
    """

    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service

    async def search(
        self,
        session: AsyncSession,
        query: str,
        *,
        top_k: int = 10,
        min_score: float = 0.3,
        repo_id: int | None = None,
    ) -> list[SearchResult]:
        """
        Perform semantic search using cosine similarity.

        Args:
            session: Database session
            query: Natural language query
            top_k: Number of results to return
            min_score: Minimum similarity score (0-1)
            repo_id: Optional filter by repository
        """
        # Generate query embedding
        query_embedding = self.embedding_service.embed_text(query)

        # Build the SQL query with pgvector cosine distance
        sql = """
            SELECT
                ed.id as document_id,
                ed.pull_request_id,
                ed.document_type,
                ed.title,
                ed.content,
                ed.pr_number,
                ed.author,
                ed.pr_date,
                ed.release,
                ed.components,
                ed.change_types,
                pr.html_url,
                1 - (ed.embedding <=> :query_embedding::vector) as similarity_score
            FROM engineering_documents ed
            JOIN pull_requests pr ON ed.pull_request_id = pr.id
            WHERE ed.embedding IS NOT NULL
        """
        params: dict[str, Any] = {"query_embedding": str(query_embedding)}

        if repo_id:
            sql += " AND pr.repository_id = :repo_id"
            params["repo_id"] = repo_id

        sql += """
            HAVING 1 - (ed.embedding <=> :query_embedding2::vector) > :min_score
            ORDER BY similarity_score DESC
            LIMIT :top_k
        """
        params["query_embedding2"] = str(query_embedding)
        params["min_score"] = min_score
        params["top_k"] = top_k

        # pgvector doesn't support HAVING on calculated columns in all cases,
        # so we use a subquery approach
        sql = f"""
            SELECT * FROM (
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
                    1 - (ed.embedding <=> :query_embedding::vector) as similarity_score
                FROM engineering_documents ed
                JOIN pull_requests pr ON ed.pull_request_id = pr.id
                WHERE ed.embedding IS NOT NULL
                {"AND pr.repository_id = :repo_id" if repo_id else ""}
            ) sub
            WHERE similarity_score > :min_score
            ORDER BY similarity_score DESC
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
                    score=float(row.similarity_score),
                    pr_number=row.pr_number,
                    author=row.author,
                    pr_date=row.pr_date,
                    release=row.release,
                    components=row.components,
                    change_types=row.change_types,
                    html_url=row.html_url,
                    source="vector",
                )
            )

        logger.info(
            "Vector search for '%s' returned %d results (top score: %.3f)",
            query[:50],
            len(results),
            results[0].score if results else 0,
        )
        return results
