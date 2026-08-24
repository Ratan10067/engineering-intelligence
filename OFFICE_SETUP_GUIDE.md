# 🏢 Engineering Intelligence — Office Laptop Complete Setup Guide

Follow this step-by-step guide to set up and run the entire platform on a new office laptop (Mac, Linux, or Windows WSL) in under 10 minutes.

---

## 📋 System Prerequisites

Ensure you have the following installed on your machine:
1. **Git**: `git --version`
2. **Python 3.10+**: `python3 --version`
3. **Node.js 18+ & npm**: `node --version && npm --version`
4. **PostgreSQL 15+** with **`pgvector`**
5. **Ollama** (Local LLM runner): [https://ollama.com](https://ollama.com)

---

## ⚡ Step 1: Clone the Repository

```bash
git clone https://github.com/Ratan10067/engineering-intelligence.git
cd engineering-intelligence
```

---

## 🗄️ Step 2: Setup PostgreSQL & `pgvector`

### On macOS (Homebrew):
```bash
# 1. Install PostgreSQL & pgvector
brew install postgresql@16 pgvector
brew services start postgresql@16

# 2. Create the database
createdb engineering_intelligence

# 3. Enable pgvector extension
psql -d engineering_intelligence -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### On Ubuntu/Debian Linux:
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-16-pgvector
sudo -u postgres psql -c "CREATE DATABASE engineering_intelligence;"
sudo -u postgres psql -d engineering_intelligence -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 🤖 Step 3: Setup Ollama (Local LLM)

```bash
# 1. Start Ollama service (if not running)
ollama serve

# 2. Pull the model (in a separate terminal)
ollama pull gemma3:12b-it-q4_K_M
```
*(Tip: If your office laptop has 8GB–16GB RAM, you can also use `ollama pull llama3.2:3b` or `ollama pull mistral:7b` and update `OLLAMA_MODEL` in `.env`)*

---

## 🐍 Step 4: Setup Backend (FastAPI)

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate a clean virtual environment
python3 -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

# 3. Install all dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Configure Environment Variables
cp ../.env.example .env
```

Open `.env` in your editor and configure your credentials:
```bash
# Database URL
DATABASE_URL=postgresql+asyncpg://<your_username>@localhost:5432/engineering_intelligence
DATABASE_URL_SYNC=postgresql://<your_username>@localhost:5432/engineering_intelligence

# GitHub Token (create at https://github.com/settings/tokens)
GITHUB_TOKEN=ghp_your_token_here

# Ollama LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b-it-q4_K_M
```

```bash
# 5. Start the backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend will be running at:* `http://localhost:8000`  
*API Docs available at:* `http://localhost:8000/docs`

---

## 🎨 Step 5: Setup Frontend (Next.js 14)

Open a **new terminal tab**:

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start Next.js development server
npm run dev
```
*Frontend UI will be running at:* `http://localhost:3000`

---

## 🧪 Step 6: Verify the Installation

### 1. Check Detailed Health:
Open `http://localhost:8000/api/health/detailed` in your browser:
```json
{
  "status": "healthy",
  "dependencies": {
    "database": "connected (pgvector enabled)",
    "ollama": "connected (gemma3:12b-it-q4_K_M)",
    "embedding_model": "loaded (384-d MiniLM-L6-v2)"
  }
}
```

### 2. (Optional) Seed Demo Data for Instant Offline Testing:
If you want to immediately load sample PRs without waiting for GitHub API:
```bash
cd backend
source .venv/bin/activate
python scripts/seed_demo_data.py
```

---

## 🔄 Step 7: How to Use Daily at the Office

1. **Add Office Repositories:**  
   Go to `http://localhost:3000` → Add your company repo `org/repo-name` → Click **Sync Now**.
2. **Autonomous Webhooks:**  
   Add `https://your-domain.com/api/webhooks/github` to GitHub Webhooks to auto-index every merged PR!
3. **Ask Architecture & Bug Questions:**  
   Go to `http://localhost:3000/questions` and ask any question with full evidence tracking!

---

## 🛑 Quick Troubleshooting

| Issue | Solution |
| :--- | :--- |
| `ModuleNotFoundError: No module named 'sqlalchemy'` | Activate virtual environment: `source .venv/bin/activate` before running `uvicorn`. |
| `pgvector extension not found` | Run `CREATE EXTENSION IF NOT EXISTS vector;` in PostgreSQL. |
| `Ollama connection error` | Ensure `ollama serve` is running in the background. |
| `Rate limit exceeded on GitHub` | Add your `GITHUB_TOKEN` in `.env`. |
