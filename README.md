# ⚡ Engineering Intelligence Platform

AI-powered platform that converts historical GitHub engineering activity into a searchable **Engineering Memory** with evidence-backed Q&A.

## 🎯 What It Does

- **Collects** GitHub PR data: metadata, commits, files, diffs, reviews, comments, linked issues
- **Understands** engineering changes using a local LLM (Ollama)
- **Indexes** structured knowledge with embeddings (sentence-transformers) and pgvector
- **Searches** using hybrid retrieval: semantic + keyword + metadata with RRF ranking
- **Answers** questions with evidence-backed responses citing specific PRs and commits

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python + FastAPI |
| Database | PostgreSQL + pgvector |
| LLM | Ollama (gemma3:12b) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Frontend | Next.js 14 (App Router) |
| Deployment | Docker Compose |

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector
- Ollama running with a model
- Node.js 18+
- GitHub Personal Access Token

### Setup

```bash
# Clone and setup
make setup

# Edit your configuration
vim .env  # Add your GITHUB_TOKEN and GITHUB_DEFAULT_REPO

# Start development servers
make dev
```

Backend: http://localhost:8000  
Frontend: http://localhost:3000  
API Docs: http://localhost:8000/docs  

### Docker

```bash
docker compose up -d --build
```

## 📖 Usage

### 1. Add a Repository

Navigate to the Dashboard and add your GitHub repository (e.g., `facebook/react`).

### 2. Sync Data

Click **Sync** to start the pipeline:
- **Collecting** — Fetches PRs, commits, files, reviews from GitHub
- **Understanding** — LLM analyzes each PR for structured knowledge
- **Embedding** — Generates search vectors for all documents

### 3. Search

Use the Search page to find PRs by keyword, component, author, release, or semantic similarity.

### 4. Ask Questions

Use the Q&A page to ask natural language questions:
- "What changed between release 5.2 and 5.3?"
- "Have we seen this issue before?"
- "Which PRs affected memory or performance?"
- "Why was this architecture changed?"

Every answer includes evidence citations linking back to specific PRs.

## 📂 Project Structure

```
engineering-intelligence/
├── backend/
│   ├── app/
│   │   ├── api/routes/        # FastAPI endpoints
│   │   ├── collectors/        # GitHub data collection
│   │   ├── db/                # Database models & CRUD
│   │   ├── llm/               # LLM provider (Ollama)
│   │   ├── embeddings/        # sentence-transformers
│   │   ├── services/          # PR understanding & documents
│   │   ├── retrieval/         # Vector, keyword, hybrid search
│   │   └── rag/               # RAG engine & evidence tracking
│   └── scripts/
├── frontend/
│   ├── app/                   # Next.js pages
│   └── lib/                   # API client
├── docker-compose.yml
├── Makefile
└── .env.example
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/repositories` | Register a repository |
| POST | `/api/repositories/{id}/sync` | Start sync pipeline |
| GET | `/api/repositories/{id}/status` | Check sync status |
| GET | `/api/pull-requests?repo_id=X` | List pull requests |
| GET | `/api/pull-requests/{id}` | PR detail with knowledge |
| POST | `/api/search` | Hybrid search |
| POST | `/api/questions` | RAG-based Q&A |
| GET | `/api/questions/stats` | System statistics |
| GET | `/api/health/detailed` | Health check |

## 🧪 Make Commands

```bash
make help          # Show all commands
make setup         # Full project setup
make dev           # Start dev servers
make sync          # Trigger GitHub sync
make stats         # Show system stats
make health        # Check backend health
make db-reset      # Reset database
make docker-up     # Docker Compose up
make test          # Run tests
```

## 📊 Key Design Decisions

1. **Evidence-backed answers** — Every claim cites specific PRs
2. **DOCUMENTED vs INFERRED vs UNKNOWN** — Evidence classification prevents hallucination
3. **Hybrid retrieval** — Combines vector + keyword + metadata with RRF ranking
4. **Idempotent ingestion** — Safe to re-run without duplicates
5. **Local-first** — All AI runs locally (Ollama + sentence-transformers)
6. **Pluggable LLM** — Abstract provider interface for easy swapping

## 📝 License

Internal use only.
