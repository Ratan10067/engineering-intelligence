"""
Engineering Intelligence Platform — FastAPI Dependencies.

Provides dependency injection for database sessions, services,
and singletons used across all API routes.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.database import get_db_session
from app.embeddings.embedding_service import EmbeddingService
from app.llm.ollama_provider import OllamaProvider
from app.rag.rag_engine import RAGEngine
from app.retrieval.hybrid_retriever import HybridRetriever
from app.services.document_service import DocumentService
from app.services.pr_understanding import PRUnderstandingService


# ── Singletons ──────────────────────────────────────────────────────────────

_embedding_service: EmbeddingService | None = None
_ollama_provider: OllamaProvider | None = None
_rag_engine: RAGEngine | None = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the embedding service singleton."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


def get_llm_provider() -> OllamaProvider:
    """Get or create the Ollama LLM provider singleton."""
    global _ollama_provider
    if _ollama_provider is None:
        _ollama_provider = OllamaProvider()
    return _ollama_provider


def get_rag_engine() -> RAGEngine:
    """Get or create the RAG engine singleton."""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine(
            llm=get_llm_provider(),
            embedding_service=get_embedding_service(),
        )
    return _rag_engine


def get_pr_understanding_service() -> PRUnderstandingService:
    """Get PR understanding service."""
    return PRUnderstandingService(llm=get_llm_provider())


def get_document_service() -> DocumentService:
    """Get document service."""
    return DocumentService()


def get_hybrid_retriever() -> HybridRetriever:
    """Get hybrid retriever."""
    return HybridRetriever(get_embedding_service())
