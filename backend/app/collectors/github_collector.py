"""
Engineering Intelligence Platform — GitHub Data Collector.

Async GitHub REST API client that fetches complete PR data including
commits, files, diffs, reviews, comments, and linked issues.
Handles pagination, rate limiting, and retry with exponential backoff.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class GitHubRateLimitError(Exception):
    """Raised when GitHub API rate limit is exceeded."""

    def __init__(self, reset_at: datetime | None = None):
        self.reset_at = reset_at
        super().__init__(f"Rate limit exceeded, resets at {reset_at}")


class GitHubCollector:
    """
    Async GitHub REST API client for collecting PR data.

    Features:
    - Full PR data: metadata, commits, files, diffs, reviews, comments
    - Automatic pagination
    - Rate limit handling with sleep-and-retry
    - Exponential backoff on transient failures
    - Configurable batch sizes
    """

    BASE_URL = "https://api.github.com"

    def __init__(self, token: str | None = None):
        self.token = token if token is not None else settings.github_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> GitHubCollector:
        headers: dict[str, str] = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Engineering-Intelligence-Platform",
        }
        if self.token and not self.token.startswith("ghp_your_token") and self.token.strip():
            headers["Authorization"] = f"Bearer {self.token.strip()}"
        else:
            logger.info("Using unauthenticated GitHub API requests (public repositories). Set GITHUB_TOKEN for higher rate limits.")

        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("GitHubCollector must be used as async context manager")
        return self._client

    # ── Rate Limit Handling ─────────────────────────────────────────────

    async def _check_rate_limit(self, response: httpx.Response) -> None:
        """Check rate limit headers and sleep if necessary."""
        remaining = int(response.headers.get("x-ratelimit-remaining", 100))
        reset_timestamp = int(response.headers.get("x-ratelimit-reset", 0))

        if response.status_code == 403 and remaining == 0:
            reset_at = datetime.fromtimestamp(reset_timestamp, tz=timezone.utc)
            wait_seconds = max(
                (reset_at - datetime.now(timezone.utc)).total_seconds() + 5, 10
            )
            logger.warning(
                "Rate limit exceeded. Waiting %.0f seconds until %s",
                wait_seconds,
                reset_at.isoformat(),
            )
            await asyncio.sleep(min(wait_seconds, settings.rate_limit_wait * 2))
            raise GitHubRateLimitError(reset_at)

        if remaining < 50:
            logger.info("Rate limit low: %d remaining", remaining)

    # ── Core HTTP ───────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, GitHubRateLimitError)),
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=2, min=2, max=60),
        reraise=True,
    )
    async def _request(
        self, method: str, url: str, **kwargs: Any
    ) -> httpx.Response:
        """Make an HTTP request with retry and rate limit handling."""
        response = await self.client.request(method, url, **kwargs)

        if response.status_code == 401 and "Authorization" in self.client.headers:
            logger.warning("GitHub token returned 401 (Bad credentials). Falling back to unauthenticated public API.")
            del self.client.headers["Authorization"]
            response = await self.client.request(method, url, **kwargs)

        await self._check_rate_limit(response)

        if response.status_code in (404, 422):
            return response  # Handle 404/422 at call site

        response.raise_for_status()
        return response

    async def _get_json(self, url: str, **kwargs: Any) -> Any:
        """GET request returning parsed JSON."""
        response = await self._request("GET", url, **kwargs)
        if response.status_code in (404, 422):
            return None
        return response.json()

    async def _get_paginated(
        self, url: str, *, max_items: int | None = None, **kwargs: Any
    ) -> list[dict[str, Any]]:
        """Fetch all pages of a paginated GitHub API endpoint."""
        all_items: list[dict[str, Any]] = []
        params = kwargs.pop("params", {})
        params.setdefault("per_page", 100)
        page = 1

        while True:
            params["page"] = page
            response = await self._request("GET", url, params=params, **kwargs)

            if response.status_code == 404:
                break

            items = response.json()
            if not items:
                break

            all_items.extend(items)

            if max_items and len(all_items) >= max_items:
                all_items = all_items[:max_items]
                break

            # Check for next page via Link header
            link_header = response.headers.get("link", "")
            if 'rel="next"' not in link_header:
                break

            page += 1

        return all_items

    # ── Repository ──────────────────────────────────────────────────────

    async def get_repository(self, owner: str, repo: str) -> dict[str, Any] | None:
        """Fetch repository metadata."""
        return await self._get_json(f"/repos/{owner}/{repo}")

    # ── Pull Requests ───────────────────────────────────────────────────

    async def get_merged_pull_requests(
        self,
        owner: str,
        repo: str,
        *,
        max_prs: int = 50,
        since: datetime | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        exclude_pr_numbers: set[int] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch merged pull requests, optionally filtered by date range (from_date to to_date)
        and excluding already indexed PR numbers.

        Args:
            owner: Repository owner
            repo: Repository name
            max_prs: Maximum number of PRs to fetch
            since: Only fetch PRs updated after this time
            from_date: Minimum merge/creation date (inclusive)
            to_date: Maximum merge/creation date (inclusive)
            exclude_pr_numbers: Set of PR numbers to skip (already indexed in database)
        """
        exclude_set = exclude_pr_numbers or set()
        detailed_prs: list[dict[str, Any]] = []
        page = 1
        max_pages = 30  # Search up to 30 pages (1500 PRs max) when querying date ranges

        from_dt = (
            from_date.replace(tzinfo=timezone.utc)
            if from_date and not from_date.tzinfo
            else from_date
        )
        to_dt = (
            to_date.replace(tzinfo=timezone.utc)
            if to_date and not to_date.tzinfo
            else to_date
        )

        should_stop = False

        while len(detailed_prs) < max_prs and page <= max_pages and not should_stop:
            params: dict[str, Any] = {
                "state": "closed",
                "sort": "created",
                "direction": "desc",
                "per_page": 50,
                "page": page,
            }
            if since and not exclude_set and not from_date:
                params["since"] = since.isoformat()

            page_prs = await self._get_json(
                f"/repos/{owner}/{repo}/pulls",
                params=params,
            )

            if not page_prs or not isinstance(page_prs, list) or len(page_prs) == 0:
                break

            for pr in page_prs:
                if len(detailed_prs) >= max_prs:
                    break

                # Filter: only merged PRs
                if pr.get("merged_at") is None:
                    continue

                # Parse PR dates
                merged_at_str = pr.get("merged_at")
                created_at_str = pr.get("created_at")
                pr_date = None
                if merged_at_str:
                    try:
                        pr_date = datetime.fromisoformat(merged_at_str.replace("Z", "+00:00"))
                    except Exception:
                        pass
                elif created_at_str:
                    try:
                        pr_date = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    except Exception:
                        pass

                # Date filtering
                if to_dt and pr_date and pr_date > to_dt:
                    # Newer than to_date — skip and keep going backwards
                    continue

                if from_dt and pr_date and pr_date < from_dt:
                    # Older than from_date (and we sort desc by created) — we passed the date window
                    should_stop = True
                    break

                # Skip if already in database
                if pr["number"] in exclude_set:
                    continue

                detail = await self._get_json(
                    f"/repos/{owner}/{repo}/pulls/{pr['number']}"
                )
                if detail:
                    detailed_prs.append(detail)

                # Small delay to be kind to rate limits
                if len(detailed_prs) % 10 == 0:
                    await asyncio.sleep(0.5)

            page += 1

        date_desc = ""
        if from_date or to_date:
            date_desc = f" (filtered {from_date.strftime('%Y-%m-%d') if from_date else 'start'} to {to_date.strftime('%Y-%m-%d') if to_date else 'now'})"

        logger.info(
            "Fetched %d merged PRs for %s/%s%s", len(detailed_prs), owner, repo, date_desc
        )
        return detailed_prs

    async def get_pull_request(
        self, owner: str, repo: str, pr_number: int
    ) -> dict[str, Any] | None:
        """Fetch details for a single PR."""
        return await self._get_json(f"/repos/{owner}/{repo}/pulls/{pr_number}")

    async def get_commit(
        self, owner: str, repo: str, sha: str
    ) -> dict[str, Any] | None:
        """Fetch on-demand details and diff patches for a specific commit."""
        return await self._get_json(f"/repos/{owner}/{repo}/commits/{sha}")

    # ── PR Sub-resources ────────────────────────────────────────────────

    async def get_pr_commits(
        self, owner: str, repo: str, pr_number: int
    ) -> list[dict[str, Any]]:
        """Fetch commits for a PR."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/pulls/{pr_number}/commits"
        )

    async def get_pr_files(
        self, owner: str, repo: str, pr_number: int
    ) -> list[dict[str, Any]]:
        """Fetch changed files for a PR (includes diffs as patch)."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/pulls/{pr_number}/files"
        )

    async def get_pr_reviews(
        self, owner: str, repo: str, pr_number: int
    ) -> list[dict[str, Any]]:
        """Fetch reviews for a PR."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews"
        )

    async def get_pr_review_comments(
        self, owner: str, repo: str, pr_number: int
    ) -> list[dict[str, Any]]:
        """Fetch inline review comments for a PR."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/pulls/{pr_number}/comments"
        )

    async def get_pr_discussion_comments(
        self, owner: str, repo: str, pr_number: int
    ) -> list[dict[str, Any]]:
        """Fetch general discussion (issue) comments for a PR."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/issues/{pr_number}/comments"
        )

    # ── Issues ──────────────────────────────────────────────────────────

    async def get_issue(
        self, owner: str, repo: str, issue_number: int
    ) -> dict[str, Any] | None:
        """Fetch a single issue by number."""
        return await self._get_json(f"/repos/{owner}/{repo}/issues/{issue_number}")

    async def extract_linked_issues(
        self, owner: str, repo: str, pr_body: str | None
    ) -> list[dict[str, Any]]:
        """
        Extract and fetch issues linked from PR body.
        Looks for patterns like: fixes #123, closes #456, resolves #789
        """
        if not pr_body:
            return []

        pattern = r"(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)"
        issue_numbers = re.findall(pattern, pr_body, re.IGNORECASE)

        issues = []
        for num_str in set(issue_numbers):
            issue = await self.get_issue(owner, repo, int(num_str))
            if issue and "pull_request" not in issue:
                issues.append(issue)

        return issues

    # ── Releases ────────────────────────────────────────────────────────

    async def get_releases(
        self, owner: str, repo: str, max_releases: int = 50
    ) -> list[dict[str, Any]]:
        """Fetch repository releases."""
        return await self._get_paginated(
            f"/repos/{owner}/{repo}/releases",
            max_items=max_releases,
        )

    # ── Full PR Collection ──────────────────────────────────────────────

    async def collect_full_pr_data(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        pr_data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Collect complete data for a single PR: commits, files, reviews,
        comments, and linked issues.

        Returns an enriched dict with all sub-resources attached.
        """
        logger.info("Collecting full data for PR #%d", pr_number)

        # Fetch all sub-resources concurrently
        commits, files, reviews, review_comments, discussion_comments = (
            await asyncio.gather(
                self.get_pr_commits(owner, repo, pr_number),
                self.get_pr_files(owner, repo, pr_number),
                self.get_pr_reviews(owner, repo, pr_number),
                self.get_pr_review_comments(owner, repo, pr_number),
                self.get_pr_discussion_comments(owner, repo, pr_number),
            )
        )

        # Extract linked issues from PR body
        linked_issues = await self.extract_linked_issues(
            owner, repo, pr_data.get("body")
        )

        return {
            "pr": pr_data,
            "commits": commits,
            "files": files,
            "reviews": reviews,
            "review_comments": review_comments,
            "discussion_comments": discussion_comments,
            "linked_issues": linked_issues,
        }

    async def collect_repository_prs(
        self,
        owner: str,
        repo: str,
        *,
        max_prs: int = 50,
        since: datetime | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        exclude_pr_numbers: set[int] | None = None,
        progress_callback: Any = None,
    ) -> list[dict[str, Any]]:
        """
        Collect complete data for multiple PRs.

        Args:
            owner: Repository owner
            repo: Repository name
            max_prs: Maximum number of PRs to collect
            since: Only collect PRs updated after this time
            from_date: Minimum merge/creation date (inclusive)
            to_date: Maximum merge/creation date (inclusive)
            exclude_pr_numbers: Set of PR numbers to skip (already indexed in database)
            progress_callback: Optional async callback(current, total, pr_number)
        """
        # Fetch merged PRs
        prs = await self.get_merged_pull_requests(
            owner,
            repo,
            max_prs=max_prs,
            since=since,
            from_date=from_date,
            to_date=to_date,
            exclude_pr_numbers=exclude_pr_numbers,
        )

        logger.info("Collecting full data for %d PRs", len(prs))

        results = []
        for idx, pr in enumerate(prs):
            try:
                full_data = await self.collect_full_pr_data(
                    owner, repo, pr["number"], pr
                )
                results.append(full_data)

                if progress_callback:
                    await progress_callback(idx + 1, len(prs), pr["number"])

                # Rate limit courtesy delay
                if (idx + 1) % 5 == 0:
                    await asyncio.sleep(1.0)

            except Exception as e:
                logger.error("Failed to collect PR #%d: %s", pr["number"], e)
                continue

        logger.info("Successfully collected %d/%d PRs", len(results), len(prs))
        return results
