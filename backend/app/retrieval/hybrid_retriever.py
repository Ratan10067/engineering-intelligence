"""
Engineering Intelligence Platform — Hybrid Retriever.

Combines vector search, keyword search, and metadata filtering
using Reciprocal Rank Fusion (RRF) for optimal result ranking.
This is the heart of the retrieval system.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings.embedding_service import EmbeddingService
from app.retrieval.keyword_search import KeywordSearch
from app.retrieval.metadata_filter import MetadataFilter, MetadataFilters
from app.retrieval.vector_search import SearchResult, VectorSearch

logger = logging.getLogger(__name__)


class HybridRetriever:
    """
    Combines multiple retrieval strategies with Reciprocal Rank Fusion.

    Pipeline:
    1. Run vector search (semantic similarity)
    2. Run keyword search (exact identifiers)
    3. Run metadata filter (structured filters)
    4. Combine results using RRF scoring
    5. Deduplicate by PR
    6. Return top-k ranked results
    """

    # RRF constant (standard value from the literature)
    RRF_K = 60

    # Weight multipliers for each search type
    VECTOR_WEIGHT = 1.0
    KEYWORD_WEIGHT = 0.8
    METADATA_WEIGHT = 0.6

    def __init__(self, embedding_service: EmbeddingService):
        self.vector_search = VectorSearch(embedding_service)
        self.keyword_search = KeywordSearch()
        self.metadata_filter = MetadataFilter()

    def _reciprocal_rank_fusion(
        self,
        ranked_lists: list[tuple[list[SearchResult], float]],
    ) -> list[SearchResult]:
        """
        Combine multiple ranked lists using Reciprocal Rank Fusion.

        RRF score for document d: sum(weight / (k + rank_i(d)))
        where rank_i(d) is the rank of d in list i.

        Args:
            ranked_lists: List of (results, weight) tuples
        """
        # Map document_id -> accumulated RRF score + best result object
        scores: dict[int, float] = {}
        best_results: dict[int, SearchResult] = {}

        for results, weight in ranked_lists:
            for rank, result in enumerate(results):
                doc_id = result.document_id
                rrf_score = weight / (self.RRF_K + rank + 1)
                scores[doc_id] = scores.get(doc_id, 0) + rrf_score

                # Keep the result object with the highest original score
                if doc_id not in best_results or result.score > best_results[doc_id].score:
                    best_results[doc_id] = result

        # Sort by RRF score
        sorted_ids = sorted(scores.keys(), key=lambda d: scores[d], reverse=True)
        max_rrf = max(scores.values()) if scores else 1.0

        # Build final results with normalized scores and RRF metadata
        fused_results = []
        for doc_id in sorted_ids:
            result = best_results[doc_id]
            rrf_val = scores[doc_id]
            result.metadata["rrf_score"] = rrf_val

            # Preserve original vector cosine similarity if available
            orig_score = result.score
            # Normalize RRF relative to highest rank
            relative_rrf = (rrf_val / max_rrf) if max_rrf > 0 else 0.5

            if orig_score > 0.05 and orig_score <= 1.0:
                # Result had vector similarity: boost slightly if also matched by keyword (high RRF)
                final_score = min(0.99, orig_score * (1.1 if rrf_val > 0.02 else 1.0))
            else:
                # Result from keyword/metadata only: scale relative to top rank (0.50 to 0.90)
                final_score = 0.50 + (relative_rrf * 0.40)

            result.score = round(final_score, 4)
            fused_results.append(result)

        return fused_results

    def _deduplicate_by_pr(
        self, results: list[SearchResult], max_per_pr: int = 2
    ) -> list[SearchResult]:
        """
        Deduplicate results, keeping at most max_per_pr documents per PR.

        Keeps the highest-scored document for each PR.
        """
        pr_counts: dict[int, int] = {}
        deduplicated = []

        for result in results:
            pr_id = result.pull_request_id
            count = pr_counts.get(pr_id, 0)
            if count < max_per_pr:
                deduplicated.append(result)
                pr_counts[pr_id] = count + 1

        return deduplicated

    async def search(
        self,
        session: AsyncSession,
        query: str,
        *,
        filters: MetadataFilters | None = None,
        top_k: int = 5,
        vector_top_k: int = 15,
        keyword_top_k: int = 15,
        min_vector_score: float = 0.25,
        repo_id: int | None = None,
    ) -> list[SearchResult]:
        """
        Perform hybrid search combining vector, keyword, and metadata.

        Args:
            session: Database session
            query: Natural language query
            filters: Optional metadata filters
            top_k: Final number of results to return
            vector_top_k: Internal vector search top-k
            keyword_top_k: Internal keyword search top-k
            min_vector_score: Minimum cosine similarity for vector results
            repo_id: Optional repository filter
        """
        ranked_lists: list[tuple[list[SearchResult], float]] = []

        # 1. Vector search
        try:
            vector_results = await self.vector_search.search(
                session,
                query,
                top_k=vector_top_k,
                min_score=min_vector_score,
                repo_id=repo_id,
            )
            if vector_results:
                ranked_lists.append((vector_results, self.VECTOR_WEIGHT))
        except Exception as e:
            logger.warning("Vector search failed: %s", e)

        # 2. Keyword search
        try:
            keyword_results = await self.keyword_search.search(
                session,
                query,
                top_k=keyword_top_k,
                repo_id=repo_id,
            )
            if keyword_results:
                ranked_lists.append((keyword_results, self.KEYWORD_WEIGHT))
        except Exception as e:
            logger.warning("Keyword search failed: %s", e)

        # 3. Metadata filter (if filters provided)
        if filters and filters.has_filters():
            try:
                if repo_id and not filters.repo_id:
                    filters.repo_id = repo_id
                metadata_results = await self.metadata_filter.search(
                    session,
                    filters,
                    top_k=20,
                )
                if metadata_results:
                    ranked_lists.append((metadata_results, self.METADATA_WEIGHT))
            except Exception as e:
                logger.warning("Metadata filter failed: %s", e)

        if not ranked_lists:
            logger.warning("No results from any search method for query: %s", query[:50])
            return []

        # 4. Reciprocal Rank Fusion
        fused = self._reciprocal_rank_fusion(ranked_lists)

        # 5. Deduplicate by PR
        deduplicated = self._deduplicate_by_pr(fused)

        # 6. Return top-k
        final_results = deduplicated[:top_k]

        logger.info(
            "Hybrid search for '%s': %d vector, %d keyword, %d metadata → %d final results",
            query[:50],
            len(ranked_lists[0][0]) if len(ranked_lists) > 0 else 0,
            len(ranked_lists[1][0]) if len(ranked_lists) > 1 else 0,
            len(ranked_lists[2][0]) if len(ranked_lists) > 2 else 0,
            len(final_results),
        )

        return final_results
