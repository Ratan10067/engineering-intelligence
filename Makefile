# =============================================================================
# Engineering Intelligence Platform — Makefile
# =============================================================================

.PHONY: setup dev dev-backend dev-frontend sync test clean db-create db-reset

# ── Setup ───────────────────────────────────────────────────────────────────

setup: ## Full project setup
	@echo "📦 Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install
	@echo "🗄️ Creating database..."
	psql -U pawan -d postgres -c "CREATE DATABASE engineering_intelligence;" 2>/dev/null || true
	psql -U pawan -d engineering_intelligence -c "CREATE EXTENSION IF NOT EXISTS vector;"
	@echo "📊 Creating tables..."
	cd backend && python scripts/create_tables.py
	@echo "📋 Creating .env from template..."
	cp -n .env.example .env 2>/dev/null || true
	@echo "✅ Setup complete! Edit .env with your GitHub token."

# ── Development ─────────────────────────────────────────────────────────────

dev: ## Run backend and frontend in parallel
	@make dev-backend &
	@make dev-frontend &
	@wait

dev-backend: ## Run FastAPI backend
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run Next.js frontend
	cd frontend && npm run dev

# ── Sync ────────────────────────────────────────────────────────────────────

sync: ## Trigger sync via API (usage: make sync REPO_ID=1 MAX_PRS=50)
	@curl -s -X POST http://localhost:8000/api/repositories/$(REPO_ID)/sync \
		-H "Content-Type: application/json" \
		-d '{"max_prs": $(MAX_PRS)}' | python -m json.tool

status: ## Check sync status (usage: make status REPO_ID=1)
	@curl -s http://localhost:8000/api/repositories/$(REPO_ID)/status | python -m json.tool

stats: ## Show system statistics
	@curl -s http://localhost:8000/api/questions/stats | python -m json.tool

# ── Database ────────────────────────────────────────────────────────────────

db-create: ## Create database and tables
	psql -U pawan -d postgres -c "CREATE DATABASE engineering_intelligence;" 2>/dev/null || true
	psql -U pawan -d engineering_intelligence -c "CREATE EXTENSION IF NOT EXISTS vector;"
	cd backend && python scripts/create_tables.py

db-reset: ## Drop and recreate database
	psql -U pawan -d postgres -c "DROP DATABASE IF EXISTS engineering_intelligence;"
	@make db-create

# ── Docker ──────────────────────────────────────────────────────────────────

docker-up: ## Start all services with Docker Compose
	docker compose up -d --build

docker-down: ## Stop all Docker services
	docker compose down

docker-logs: ## Follow Docker logs
	docker compose logs -f

# ── Test ────────────────────────────────────────────────────────────────────

test: ## Run backend tests
	cd backend && python -m pytest tests/ -v

# ── Utilities ───────────────────────────────────────────────────────────────

health: ## Check backend health
	@curl -s http://localhost:8000/api/health/detailed | python -m json.tool

clean: ## Clean generated files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

# Default values
REPO_ID ?= 1
MAX_PRS ?= 50
