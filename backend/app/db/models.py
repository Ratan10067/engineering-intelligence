"""
Engineering Intelligence Platform — SQLAlchemy ORM Models.

Defines the complete data model for storing GitHub engineering data,
LLM-generated knowledge, and searchable engineering documents with
pgvector embeddings.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


# =============================================================================
# Enums
# =============================================================================


class SyncStatus(str, enum.Enum):
    """Status of a repository sync operation."""

    PENDING = "pending"
    COLLECTING = "collecting"
    UNDERSTANDING = "understanding"
    EMBEDDING = "embedding"
    COMPLETED = "completed"
    FAILED = "failed"


class EvidenceType(str, enum.Enum):
    """Classification of evidence reliability."""

    DOCUMENTED = "documented"
    INFERRED = "inferred"
    UNKNOWN = "unknown"


class DocumentType(str, enum.Enum):
    """Type of engineering document for search."""

    PR_SUMMARY = "pr_summary"
    PR_DESCRIPTION = "pr_description"
    REVIEW_DISCUSSION = "review_discussion"
    FILE_CHANGE_SUMMARY = "file_change_summary"
    ARCHITECTURE_DECISION = "architecture_decision"
    ISSUE_FIX = "issue_fix"


# =============================================================================
# Mixin
# =============================================================================


class TimestampMixin:
    """Adds created_at and updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# =============================================================================
# Repository
# =============================================================================


class Repository(TimestampMixin, Base):
    """A tracked GitHub repository."""

    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    github_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sync_status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus), default=SyncStatus.PENDING
    )
    total_prs_synced: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    pull_requests: Mapped[list[PullRequest]] = relationship(
        back_populates="repository", cascade="all, delete-orphan"
    )
    sync_logs: Mapped[list[SyncLog]] = relationship(
        back_populates="repository", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Repository {self.full_name}>"


# =============================================================================
# Pull Request
# =============================================================================


class PullRequest(TimestampMixin, Base):
    """A GitHub Pull Request with all metadata."""

    __tablename__ = "pull_requests"
    __table_args__ = (
        UniqueConstraint("repository_id", "github_pr_number", name="uq_repo_pr_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    github_pr_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    github_pr_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    state: Mapped[str] = mapped_column(String(50), nullable=False)
    is_merged: Mapped[bool] = mapped_column(Boolean, default=False)
    labels: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reviewers: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    milestone: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    release_tag: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    changed_files_count: Mapped[int] = mapped_column(Integer, default=0)
    github_created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    github_merged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    github_closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    html_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Raw JSON from GitHub for future reference
    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationships
    repository: Mapped[Repository] = relationship(back_populates="pull_requests")
    commits: Mapped[list[Commit]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    changed_files: Mapped[list[ChangedFile]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    reviews: Mapped[list[Review]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    review_comments: Mapped[list[ReviewComment]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    discussion_comments: Mapped[list[DiscussionComment]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    linked_issues: Mapped[list[LinkedIssue]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )
    knowledge: Mapped[Optional[PRKnowledge]] = relationship(
        back_populates="pull_request", uselist=False, cascade="all, delete-orphan"
    )
    engineering_documents: Mapped[list[EngineeringDocument]] = relationship(
        back_populates="pull_request", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<PullRequest #{self.github_pr_number}: {self.title[:50]}>"


# =============================================================================
# Commit
# =============================================================================


class Commit(TimestampMixin, Base):
    """A commit associated with a Pull Request."""

    __tablename__ = "commits"
    __table_args__ = (
        UniqueConstraint("pull_request_id", "sha", name="uq_pr_commit_sha"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    sha: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    author_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    committed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="commits")

    def __repr__(self) -> str:
        return f"<Commit {self.sha[:8]}>"


# =============================================================================
# Changed File
# =============================================================================


class ChangedFile(TimestampMixin, Base):
    """A file changed in a Pull Request."""

    __tablename__ = "changed_files"
    __table_args__ = (
        UniqueConstraint("pull_request_id", "filename", name="uq_pr_file"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # added, modified, removed, renamed
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    patch: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Diff content

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="changed_files")

    def __repr__(self) -> str:
        return f"<ChangedFile {self.filename}>"


# =============================================================================
# Review
# =============================================================================


class Review(TimestampMixin, Base):
    """A PR review."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("pull_request_id", "github_review_id", name="uq_pr_review"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    github_review_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    state: Mapped[str] = mapped_column(String(50), nullable=False)  # APPROVED, CHANGES_REQUESTED, COMMENTED
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="reviews")

    def __repr__(self) -> str:
        return f"<Review by {self.author}: {self.state}>"


# =============================================================================
# Review Comment
# =============================================================================


class ReviewComment(TimestampMixin, Base):
    """An inline review comment on a PR diff."""

    __tablename__ = "review_comments"
    __table_args__ = (
        UniqueConstraint(
            "pull_request_id", "github_comment_id", name="uq_pr_review_comment"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    github_comment_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    diff_hunk: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment_created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="review_comments")

    def __repr__(self) -> str:
        return f"<ReviewComment by {self.author} on {self.path}>"


# =============================================================================
# Discussion Comment
# =============================================================================


class DiscussionComment(TimestampMixin, Base):
    """A general discussion comment on a PR (not inline review)."""

    __tablename__ = "discussion_comments"
    __table_args__ = (
        UniqueConstraint(
            "pull_request_id", "github_comment_id", name="uq_pr_discussion_comment"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    github_comment_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment_created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(
        back_populates="discussion_comments"
    )

    def __repr__(self) -> str:
        return f"<DiscussionComment by {self.author}>"


# =============================================================================
# Linked Issue
# =============================================================================


class LinkedIssue(TimestampMixin, Base):
    """An issue linked to a Pull Request."""

    __tablename__ = "linked_issues"
    __table_args__ = (
        UniqueConstraint(
            "pull_request_id", "github_issue_number", name="uq_pr_linked_issue"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    github_issue_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    labels: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    html_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="linked_issues")

    def __repr__(self) -> str:
        return f"<LinkedIssue #{self.github_issue_number}>"


# =============================================================================
# PR Knowledge (LLM-Generated)
# =============================================================================


class PRKnowledge(TimestampMixin, Base):
    """Structured engineering knowledge extracted from a PR by the LLM."""

    __tablename__ = "pr_knowledge"
    __table_args__ = (
        UniqueConstraint("pull_request_id", name="uq_pr_knowledge"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    components: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # list of component names
    change_types: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # list of change type tags
    impact: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # list of impact descriptions
    architectural_change: Mapped[bool] = mapped_column(Boolean, default=False)
    key_decisions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    review_highlights: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    evidence_classification: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Full structured output from LLM
    raw_llm_output: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Processing metadata
    llm_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(back_populates="knowledge")

    def __repr__(self) -> str:
        return f"<PRKnowledge for PR #{self.pull_request_id}>"


# =============================================================================
# Engineering Document (Searchable + Embeddable)
# =============================================================================


class EngineeringDocument(TimestampMixin, Base):
    """A searchable engineering document with embedding vector for semantic search."""

    __tablename__ = "engineering_documents"
    __table_args__ = (
        Index("ix_eng_doc_fts", "search_vector", postgresql_using="gin"),
        Index(
            "ix_eng_doc_embedding",
            "embedding",
            postgresql_using="ivfflat",
            postgresql_with={"lists": 100},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pull_request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False
    )
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Metadata for filtering
    repository_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    pr_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    pr_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    release: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    components: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    change_types: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    files: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    labels: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Full-text search vector
    search_vector: Mapped[Optional[str]] = mapped_column(TSVECTOR, nullable=True)

    # Embedding vector (384 dimensions for all-MiniLM-L6-v2)
    embedding = mapped_column(Vector(384), nullable=True)

    # Relationships
    pull_request: Mapped[PullRequest] = relationship(
        back_populates="engineering_documents"
    )

    def __repr__(self) -> str:
        return f"<EngineeringDocument [{self.document_type.value}] PR#{self.pr_number}>"


# =============================================================================
# Sync Log
# =============================================================================


class SyncLog(TimestampMixin, Base):
    """Audit trail for repository synchronization operations."""

    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus), nullable=False)
    prs_collected: Mapped[int] = mapped_column(Integer, default=0)
    prs_understood: Mapped[int] = mapped_column(Integer, default=0)
    documents_created: Mapped[int] = mapped_column(Integer, default=0)
    embeddings_generated: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationships
    repository: Mapped[Repository] = relationship(back_populates="sync_logs")

    def __repr__(self) -> str:
        return f"<SyncLog repo={self.repository_id} status={self.status.value}>"
