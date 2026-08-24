"""
Engineering Intelligence Platform — Demo & Sample Data Seeder.

Seeds realistic historical engineering PRs, commits, files, reviews,
and LLM knowledge so you can test the full RAG & Search system immediately.
"""

import sys
import os
import asyncio
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.database import async_session_factory
from app.db import repositories as db_repo
from app.db.models import SyncStatus, DocumentType
from app.services.pr_understanding import PRUnderstandingService
from app.services.document_service import DocumentService
from app.embeddings.embedding_service import EmbeddingService
from app.llm.ollama_provider import OllamaProvider


SAMPLE_PRS = [
    {
        "pr": {
            "id": 10834,
            "number": 834,
            "title": "Optimize response caching eviction strategy to reduce memory footprint",
            "body": "Fixes #830. We changed the cache eviction strategy from naive TTL to LRU with memory budgeting. Under high throughput, memory consumption on low-memory containers was spiking. Documented benchmarks show memory usage reduced by 40%.",
            "user": {"login": "tiangolo"},
            "state": "closed",
            "merged": True,
            "labels": [{"name": "performance"}, {"name": "memory"}],
            "requested_reviewers": [{"login": "tomchristie"}],
            "milestone": {"title": "0.100.0"},
            "additions": 142,
            "deletions": 38,
            "changed_files": 4,
            "created_at": "2026-05-12T10:00:00Z",
            "merged_at": "2026-05-14T14:30:00Z",
            "html_url": "https://github.com/fastapi/fastapi/pull/834",
        },
        "commits": [
            {"sha": "a1b2c3d4e5f67890123456789012345678901234", "commit": {"message": "refactor(cache): implement LRU memory budget eviction", "author": {"name": "Sebastián Ramírez", "email": "tiangolo@example.com", "date": "2026-05-12T10:30:00Z"}}},
            {"sha": "b2c3d4e5f678901234567890123456789012345a", "commit": {"message": "test(cache): add benchmark tests for memory pressure", "author": {"name": "Sebastián Ramírez", "email": "tiangolo@example.com", "date": "2026-05-13T09:15:00Z"}}},
        ],
        "files": [
            {"filename": "fastapi/cache.py", "status": "modified", "additions": 98, "deletions": 28, "patch": "@@ -45,10 +45,35 @@ class ResponseCache:\n-    def evict_expired(self):\n-        # Naive linear scan\n+    def evict_lru_budget(self, max_bytes: int):\n+        # LRU eviction with byte budgeting\n+        while self.current_size > max_bytes and self._lru_order:\n+            oldest_key = self._lru_order.popleft()\n+            del self._store[oldest_key]"},
            {"filename": "fastapi/dependencies/models.py", "status": "modified", "additions": 24, "deletions": 10, "patch": "@@ -12,6 +12,18 @@ class CacheConfig:\n+    max_memory_mb: int = 128"},
            {"filename": "tests/test_cache_memory.py", "status": "added", "additions": 20, "deletions": 0, "patch": "@@ -0,0 +1,20 @@\n+def test_lru_eviction_under_memory_pressure():\n+    pass"},
        ],
        "reviews": [
            {"id": 501, "user": {"login": "tomchristie"}, "state": "APPROVED", "body": "Great optimization. The memory budgeting is much safer for containerized deployments.", "submitted_at": "2026-05-14T11:00:00Z"}
        ],
        "review_comments": [],
        "discussion_comments": [
            {"id": 601, "user": {"login": "tiangolo"}, "body": "Verified on 512MB RAM Docker instances under 10k req/s load.", "created_at": "2026-05-13T16:00:00Z"}
        ],
        "linked_issues": [
            {"number": 830, "title": "Memory leak / excessive footprint under high cache load", "state": "closed", "body": "Container OOM killed when cache exceeds available memory.", "labels": [{"name": "bug"}, {"name": "memory"}], "html_url": "https://github.com/fastapi/fastapi/issues/830"}
        ],
    },
    {
        "pr": {
            "id": 10920,
            "number": 920,
            "title": "Migrate background tasks runner to async taskgroups for concurrency safety",
            "body": "Closes #915. Refactored BackgroundTasks execution engine from raw threads to structured asyncio TaskGroups. This eliminates race conditions during connection teardown and improves error propagation.",
            "user": {"login": "tiangolo"},
            "state": "closed",
            "merged": True,
            "labels": [{"name": "architecture"}, {"name": "concurrency"}],
            "requested_reviewers": [],
            "milestone": {"title": "0.101.0"},
            "additions": 210,
            "deletions": 85,
            "changed_files": 6,
            "created_at": "2026-06-01T12:00:00Z",
            "merged_at": "2026-06-03T15:00:00Z",
            "html_url": "https://github.com/fastapi/fastapi/pull/920",
        },
        "commits": [
            {"sha": "c3d4e5f678901234567890123456789012345ab1", "commit": {"message": "feat(background): use asyncio.TaskGroup for background jobs", "author": {"name": "Sebastián Ramírez", "email": "tiangolo@example.com", "date": "2026-06-01T14:00:00Z"}}},
        ],
        "files": [
            {"filename": "fastapi/background.py", "status": "modified", "additions": 140, "deletions": 60, "patch": "@@ -30,12 +30,35 @@ async def run_tasks(self):\n+    async with asyncio.TaskGroup() as tg:\n+        for task in self.tasks:\n+            tg.create_task(task())"},
            {"filename": "fastapi/routing.py", "status": "modified", "additions": 70, "deletions": 25, "patch": "@@ -100,8 +100,22 @@ async def handle_response():\n+    await background_tasks.run()"},
        ],
        "reviews": [
            {"id": 502, "user": {"login": "Kludex"}, "state": "APPROVED", "body": "Structured concurrency makes error handling so much cleaner.", "submitted_at": "2026-06-02T18:00:00Z"}
        ],
        "review_comments": [],
        "discussion_comments": [],
        "linked_issues": [
            {"number": 915, "title": "Background tasks unhandled exceptions silently dropped", "state": "closed", "body": "Exceptions raised inside background tasks were not caught properly.", "labels": [{"name": "bug"}], "html_url": "https://github.com/fastapi/fastapi/issues/915"}
        ],
    },
    {
        "pr": {
            "id": 10995,
            "number": 995,
            "title": "Add Pydantic v2 support with compile-time schema generation",
            "body": "Major architectural milestone for 0.100.0 release. Upgraded core validation layer to Pydantic v2 core. Increases request serialization throughput by 3x and reduces validation latency.",
            "user": {"login": "tiangolo"},
            "state": "closed",
            "merged": True,
            "labels": [{"name": "feature"}, {"name": "pydantic-v2"}, {"name": "performance"}],
            "requested_reviewers": [],
            "milestone": {"title": "0.100.0"},
            "additions": 520,
            "deletions": 310,
            "changed_files": 12,
            "created_at": "2026-04-20T08:00:00Z",
            "merged_at": "2026-05-01T12:00:00Z",
            "html_url": "https://github.com/fastapi/fastapi/pull/995",
        },
        "commits": [
            {"sha": "d4e5f678901234567890123456789012345ab12c", "commit": {"message": "feat(core): integrate pydantic-core rust serializer", "author": {"name": "Sebastián Ramírez", "email": "tiangolo@example.com", "date": "2026-04-20T10:00:00Z"}}},
        ],
        "files": [
            {"filename": "fastapi/encoders.py", "status": "modified", "additions": 220, "deletions": 150, "patch": "@@ -15,20 +15,40 @@ def jsonable_encoder():\n+    # Fast-path Pydantic v2 core serializer"},
            {"filename": "fastapi/dependencies/utils.py", "status": "modified", "additions": 300, "deletions": 160, "patch": "@@ -80,15 +80,50 @@ def get_param_sub_dependant():\n+    # Pydantic v2 field validator"},
        ],
        "reviews": [
            {"id": 503, "user": {"login": "samuelcolvin"}, "state": "APPROVED", "body": "Pydantic v2 core looks great integrated here!", "submitted_at": "2026-04-29T14:00:00Z"}
        ],
        "review_comments": [],
        "discussion_comments": [],
        "linked_issues": [],
    }
]


async def seed():
    print("🌱 Seeding sample engineering PR data into PostgreSQL...")
    async with async_session_factory() as session:
        # 1. Ensure Repository exists
        repo = await db_repo.upsert_repository(
            session,
            owner="fastapi",
            name="fastapi",
            description="FastAPI framework, high performance, easy to learn, fast to code, ready for production",
            default_branch="master",
        )
        print(f"✅ Repository: {repo.full_name} (ID: {repo.id})")

        # 2. Store Pull Requests and Sub-resources
        for item in SAMPLE_PRS:
            pr = await db_repo.upsert_pull_request(
                session, repository_id=repo.id, pr_data=item["pr"]
            )
            await db_repo.upsert_commits(session, pr.id, item.get("commits", []))
            await db_repo.upsert_changed_files(session, pr.id, item.get("files", []))
            await db_repo.upsert_reviews(session, pr.id, item.get("reviews", []))
            await db_repo.upsert_review_comments(session, pr.id, item.get("review_comments", []))
            await db_repo.upsert_discussion_comments(session, pr.id, item.get("discussion_comments", []))
            await db_repo.upsert_linked_issues(session, pr.id, item.get("linked_issues", []))
            print(f"  ✓ Stored PR #{pr.github_pr_number}: {pr.title[:50]}...")

        await session.commit()

        # 3. Generate Knowledge via LLM (or mock if Ollama busy)
        print("🧠 Generating structured engineering knowledge...")
        understanding_svc = PRUnderstandingService(OllamaProvider())
        try:
            prs_understood = await understanding_svc.understand_all_prs(session, repo.id)
            print(f"✅ Understood {prs_understood} PRs with local LLM")
        except Exception as e:
            print(f"⚠️ LLM understanding note: {e}")

        # 4. Generate Searchable Engineering Documents
        print("📚 Generating engineering documents...")
        doc_svc = DocumentService()
        docs_created = await doc_svc.create_documents_for_repo(session, repo.id)
        print(f"✅ Created {docs_created} engineering documents")

        # 5. Generate Vector Embeddings
        print("📐 Generating sentence-transformer vector embeddings...")
        embed_svc = EmbeddingService()
        embeddings_count = await embed_svc.embed_all_documents(session, repo.id)
        print(f"✅ Generated {embeddings_count} embeddings with pgvector")

        # 6. Mark Completed
        await db_repo.update_sync_status(session, repo.id, SyncStatus.COMPLETED, total_prs=len(SAMPLE_PRS))
        await session.commit()

    print("\n🎉 Seed complete! You can now test Search and Q&A on http://localhost:3000")


if __name__ == "__main__":
    asyncio.run(seed())
