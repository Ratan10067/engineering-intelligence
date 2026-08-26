"""
Engineering Intelligence Platform — Embedding Service.

Uses sentence-transformers (all-MiniLM-L6-v2) to generate 384-dim
embeddings for engineering documents. Supports single and batch
embedding generation with database storage.
"""

from __future__ import annotations

import logging
from typing import Any
import os
import numpy as np
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from app.config import get_settings
from app.db.models import EngineeringDocument

logger = logging.getLogger(__name__)

settings = get_settings()



class EmbeddingService:
    """
    Generates embeddings using sentence-transformers.

    The model is loaded once and cached for the lifetime of the service.
    Uses all-MiniLM-L6-v2 by default (384 dimensions, fast, good quality).
    """

    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or settings.embedding_model
        self._model = None

    # def _load_model(self) -> Any:
    #     """Lazy-load the embedding model."""
    #     if self._model is None:
    #         logger.info("Loading embedding model: %s", self.model_name)
    #         from sentence_transformers import SentenceTransformer
    #         model_path = str(Path(self.model_name).expanduser())
    #         self._model = SentenceTransformer(self.model_name)
    #         logger.info("Embedding model loaded successfully")
    #     return self._model

    def _load_model(self) -> Any:
        """Lazy-load the embedding model."""
        if self._model is None:
            logger.info("Loading embedding model: %s", self.model_name)
            from sentence_transformers import SentenceTransformer
            model_path = r"C:\Users\ratan.k1\Desktop\Rag\all-MiniLM-L6-v2"
            self._model = SentenceTransformer(model_path)
            logger.info("Embedding model loaded successfully")
        return self._model

    def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text string."""
        model = self._load_model()
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        model = self._load_model()
        embeddings = model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 10,
        )
        return embeddings.tolist()

    async def embed_document(
        self,
        session: AsyncSession,
        doc_id: int,
    ) -> bool:
        """Generate and store embedding for a single document."""
        result = await session.execute(
            select(EngineeringDocument).where(EngineeringDocument.id == doc_id)
        )
        doc = result.scalar_one_or_none()

        if not doc:
            logger.error("Document %d not found", doc_id)
            return False

        # Combine title and content for embedding
        embed_text = f"{doc.title}\n\n{doc.content}"
        embedding = self.embed_text(embed_text)

        # Store embedding using raw SQL for pgvector
        await session.execute(
            text(
                "UPDATE engineering_documents SET embedding = :embedding WHERE id = :doc_id"
            ),
            {"embedding": str(embedding), "doc_id": doc_id},
        )
        await session.flush()
        return True

    async def embed_all_documents(
        self,
        session: AsyncSession,
        repo_id: int | None = None,
        *,
        progress_callback: Any = None,
    ) -> int:
        """
        Generate embeddings for all documents without embeddings.

        Returns the number of documents embedded.
        """
        # Find documents without embeddings
        query = select(EngineeringDocument).where(
            EngineeringDocument.embedding == None
        )
        if repo_id:
            from app.db.models import PullRequest
            query = query.join(PullRequest).where(
                PullRequest.repository_id == repo_id
            )

        result = await session.execute(query)
        docs = list(result.scalars().all())

        if not docs:
            logger.info("No documents need embedding")
            return 0

        logger.info("Embedding %d documents", len(docs))

        # Prepare texts for batch embedding
        texts = [f"{doc.title}\n\n{doc.content}" for doc in docs]

        # Generate embeddings in batches
        embeddings = self.embed_batch(texts, batch_size=32)

        # Store embeddings
        for idx, (doc, embedding) in enumerate(zip(docs, embeddings)):
            await session.execute(
                text(
                    "UPDATE engineering_documents SET embedding = CAST(:embedding AS vector) WHERE id = :doc_id"
                ),
                {"embedding": str(embedding), "doc_id": doc.id},
            )

            if progress_callback and (idx + 1) % 10 == 0:
                await progress_callback(idx + 1, len(docs))

        await session.commit()
        logger.info("Successfully embedded %d documents", len(docs))
        return len(docs)
