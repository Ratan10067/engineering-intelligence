"""
Engineering Intelligence Platform — Evidence Tracker.

Tracks which PRs, reviews, and commits are cited in answers.
Classifies evidence as DOCUMENTED, INFERRED, or UNKNOWN.
Generates GitHub deep-links for evidence items.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class EvidenceItem:
    """A single piece of evidence backing an answer claim."""

    pr_number: int
    claim: str
    evidence_type: str  # DOCUMENTED, INFERRED, UNKNOWN
    source_text: str | None = None
    github_url: str | None = None
    confidence: float = 0.0


@dataclass
class TrackedEvidence:
    """Complete evidence tracking for an answer."""

    items: list[EvidenceItem] = field(default_factory=list)
    cited_prs: set[int] = field(default_factory=set)
    has_insufficient_evidence: bool = False
    insufficient_evidence_note: str | None = None

    def add_item(self, item: EvidenceItem) -> None:
        self.items.append(item)
        self.cited_prs.add(item.pr_number)

    def to_dict(self) -> dict[str, Any]:
        return {
            "evidence_items": [
                {
                    "pr_number": item.pr_number,
                    "claim": item.claim,
                    "evidence_type": item.evidence_type,
                    "source_text": item.source_text,
                    "github_url": item.github_url,
                    "confidence": item.confidence,
                }
                for item in self.items
            ],
            "cited_prs": sorted(self.cited_prs),
            "has_insufficient_evidence": self.has_insufficient_evidence,
            "insufficient_evidence_note": self.insufficient_evidence_note,
        }


class EvidenceTracker:
    """
    Tracks and validates evidence citations in LLM answers.

    Extracts PR references from answers, cross-references with
    retrieved evidence, and flags unsupported claims.
    """

    def extract_pr_references(self, answer: str) -> list[int]:
        """Extract PR number references from an answer text."""
        pattern = r"(?:PR|pull request)\s*#?(\d+)"
        matches = re.findall(pattern, answer, re.IGNORECASE)
        return [int(m) for m in set(matches)]

    def track_evidence(
        self,
        answer: str,
        retrieved_pr_numbers: set[int],
        evidence_data: list[dict[str, Any]],
    ) -> TrackedEvidence:
        """
        Track evidence in an answer against retrieved results.

        Args:
            answer: The LLM-generated answer
            retrieved_pr_numbers: Set of PR numbers from retrieval
            evidence_data: Evidence items from context builder
        """
        tracked = TrackedEvidence()

        # Extract PR references from answer
        referenced_prs = self.extract_pr_references(answer)

        for pr_num in referenced_prs:
            evidence_entry = next(
                (e for e in evidence_data if e.get("pr_number") == pr_num),
                None,
            )

            if evidence_entry and pr_num in retrieved_pr_numbers:
                tracked.add_item(
                    EvidenceItem(
                        pr_number=pr_num,
                        claim=f"Referenced PR #{pr_num}",
                        evidence_type="DOCUMENTED",
                        github_url=evidence_entry.get("html_url"),
                        confidence=evidence_entry.get("relevance_score", 0),
                    )
                )
            elif pr_num in retrieved_pr_numbers:
                tracked.add_item(
                    EvidenceItem(
                        pr_number=pr_num,
                        claim=f"Referenced PR #{pr_num} (found in retrieval)",
                        evidence_type="INFERRED",
                        confidence=0.5,
                    )
                )
            else:
                tracked.add_item(
                    EvidenceItem(
                        pr_number=pr_num,
                        claim=f"Referenced PR #{pr_num} (NOT in retrieved evidence)",
                        evidence_type="UNKNOWN",
                        confidence=0.0,
                    )
                )

        # Check for insufficient evidence indicators
        insufficient_patterns = [
            r"(?:could not|cannot|unable to)\s+(?:find|determine|identify)",
            r"insufficient\s+evidence",
            r"no\s+(?:relevant|matching)\s+(?:evidence|information|data)",
            r"not\s+enough\s+(?:evidence|information)",
        ]
        for pattern in insufficient_patterns:
            if re.search(pattern, answer, re.IGNORECASE):
                tracked.has_insufficient_evidence = True
                tracked.insufficient_evidence_note = (
                    "The system indicated insufficient evidence for a complete answer."
                )
                break

        return tracked
