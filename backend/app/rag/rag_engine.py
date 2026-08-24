"""
Engineering Intelligence Platform — RAG Engine.

The main question-answering pipeline that combines hybrid retrieval,
context building, LLM generation, and evidence tracking to produce
evidence-backed answers about engineering history.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings.embedding_service import EmbeddingService
from app.llm.base import LLMProvider
from app.rag.context_builder import ContextBuilder
from app.rag.evidence_tracker import EvidenceTracker
from app.retrieval.hybrid_retriever import HybridRetriever
from app.retrieval.metadata_filter import MetadataFilters

logger = logging.getLogger(__name__)


@dataclass
class RAGResponse:
    """Complete response from the RAG pipeline."""

    answer: str
    evidence: list[dict[str, Any]] = field(default_factory=list)
    evidence_tracking: dict[str, Any] = field(default_factory=dict)
    has_sufficient_evidence: bool = True
    latency: dict[str, float] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "evidence": self.evidence,
            "evidence_tracking": self.evidence_tracking,
            "has_sufficient_evidence": self.has_sufficient_evidence,
            "latency": self.latency,
            "metadata": self.metadata,
        }


class RAGEngine:
    """
    The complete RAG pipeline for evidence-backed engineering Q&A.

    Pipeline:
    1. Parse question and extract any metadata filters
    2. Hybrid retrieval (vector + keyword + metadata)
    3. Build enriched context from top results
    4. Generate answer with strict evidence requirements
    5. Track and validate evidence citations
    6. Return answer with evidence and latency metrics
    """

    SYSTEM_PROMPT = """You are an Engineering Intelligence assistant that answers questions about engineering history based ONLY on retrieved evidence from Pull Requests, code reviews, commits, and code changes.

CRITICAL RULES:
1. Answer ONLY based on the retrieved engineering evidence provided below. Do NOT use your general knowledge about software development.
2. Always cite specific PR numbers when making claims (e.g., "PR #834 changed...").
3. Distinguish clearly between:
   - DOCUMENTED facts (explicitly stated in PR descriptions, reviews, or comments)
   - INFERRED conclusions (reasonable deductions from code changes or patterns)
   - Mark inferences with phrases like "Based on the code changes..." or "The diff suggests..."
4. If the retrieved evidence does not contain enough information to answer the question, say so explicitly:
   "I could not determine this from the available engineering history. The indexed PRs and discussions do not contain sufficient evidence to answer this question."
5. Never invent engineering history or make claims not supported by the evidence.
6. When comparing releases, list specific PRs and their changes.
7. Keep answers clear, structured, and actionable for engineers.
8. Include relevant technical details from code diffs when they add value.

Format your answer with:
- A direct answer paragraph
- Bullet points for specific PR references
- A "Note" section for any caveats or limitations"""

    def __init__(
        self,
        llm: LLMProvider,
        embedding_service: EmbeddingService,
    ):
        self.llm = llm
        self.retriever = HybridRetriever(embedding_service)
        self.context_builder = ContextBuilder()
        self.evidence_tracker = EvidenceTracker()

    async def ask(
        self,
        session: AsyncSession,
        question: str,
        *,
        repo_id: int | None = None,
        filters: MetadataFilters | None = None,
        top_k: int = 5,
    ) -> RAGResponse:
        """
        Process a question through the full RAG pipeline.

        Args:
            session: Database session
            question: Natural language engineering question
            repo_id: Optional repository filter
            filters: Optional metadata filters
            top_k: Number of evidence documents to retrieve

        Returns:
            RAGResponse with answer, evidence, tracking, and latency
        """
        latency: dict[str, float] = {}
        total_start = time.monotonic()

        # 1. Hybrid Retrieval
        retrieval_start = time.monotonic()
        try:
            results = await self.retriever.search(
                session,
                question,
                filters=filters,
                top_k=top_k,
                repo_id=repo_id,
            )
        except Exception as e:
            logger.error("Retrieval failed: %s", e)
            return RAGResponse(
                answer="I encountered an error while searching the engineering history. Please try again.",
                has_sufficient_evidence=False,
                latency={"retrieval_ms": 0, "total_ms": 0},
                metadata={"error": str(e)},
            )
        latency["retrieval_ms"] = round((time.monotonic() - retrieval_start) * 1000, 1)

        # 2. Build Context
        context_start = time.monotonic()
        context = await self.context_builder.build_context(session, results, question)
        evidence_summary = self.context_builder.build_evidence_summary(results)
        latency["context_ms"] = round((time.monotonic() - context_start) * 1000, 1)

        # 3. Generate Answer
        llm_start = time.monotonic()
        user_prompt = f"""Based on the following engineering evidence, answer this question:

**Question:** {question}

{context}

Remember: Answer ONLY based on the evidence above. Cite specific PR numbers. If evidence is insufficient, say so."""

        try:
            llm_response = await self.llm.generate(
                user_prompt,
                system_prompt=self.SYSTEM_PROMPT,
                temperature=0.2,
                max_tokens=2048,
            )
            answer = llm_response.content
        except Exception as e:
            logger.error("LLM generation failed: %s", e)
            answer = (
                "I was unable to generate an answer due to a technical issue. "
                "The relevant evidence has been retrieved — please review the evidence panel."
            )
        latency["llm_ms"] = round((time.monotonic() - llm_start) * 1000, 1)

        # 4. Track Evidence
        retrieved_pr_numbers = {r.pr_number for r in results if r.pr_number}
        tracking = self.evidence_tracker.track_evidence(
            answer, retrieved_pr_numbers, evidence_summary
        )

        latency["total_ms"] = round((time.monotonic() - total_start) * 1000, 1)

        response = RAGResponse(
            answer=answer,
            evidence=evidence_summary,
            evidence_tracking=tracking.to_dict(),
            has_sufficient_evidence=not tracking.has_insufficient_evidence and len(results) > 0,
            latency=latency,
            metadata={
                "question": question,
                "total_documents_retrieved": len(results),
                "unique_prs_cited": len(tracking.cited_prs),
                "llm_model": getattr(self.llm, "model", "unknown"),
            },
        )

        logger.info(
            "RAG response for '%s': %d evidence docs, %d cited PRs, %.0fms total",
            question[:50],
            len(results),
            len(tracking.cited_prs),
            latency["total_ms"],
        )

        return response
