# 🪟 Engineering Intelligence — Windows Office Laptop Setup Guide

Complete, step-by-step setup guide for running the Engineering Intelligence Platform on **Windows 10 / 11** (Native PowerShell or WSL2) in under 10 minutes.

---

## 📋 Prerequisites on Windows

Ensure you have the following installed on your Windows laptop:

1. **Git for Windows**: Download from [git-scm.com](https://git-scm.com/download/win) (or run `winget install Git.Git`)
2. **Python 3.10, 3.11, or 3.12**: Download from [python.org](https://www.python.org/downloads/windows/)  
   ⚠️ **CRITICAL:** Check the box **"Add Python to PATH"** during installation!
3. **Node.js 18+ & npm**: Download the LTS installer from [nodejs.org](https://nodejs.org) (or run `winget install OpenJS.NodeJS.LTS`)
4. **Ollama for Windows**: Download installer from [ollama.com/download/windows](https://ollama.com/download/windows)
5. **PostgreSQL 15+ with pgvector** (Choose Option A or Option B below)

---

## ⚡ Step 1: Clone the Repository

Open **PowerShell** or **Windows Terminal**:

```powershell
# Navigate to your workspace folder (e.g. C:\Projects or Desktop)
cd C:\Users\$env:USERNAME\Desktop
git clone https://github.com/Ratan10067/engineering-intelligence.git
cd engineering-intelligence
```

---

## 🗄️ Step 2: Setup PostgreSQL & `pgvector` on Windows

You have **two easy options** on Windows:

### 🌟 Option A: Using Docker Desktop (Recommended & Easiest)
If your office laptop has Docker Desktop installed, run this single command to start PostgreSQL with `pgvector` pre-configured:
```powershell
docker run -d --name pgvector-db -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=engineering_intelligence pgvector/pgvector:pg16
```

---

### 💻 Option B: Native Windows PostgreSQL Installer
If you are installing PostgreSQL directly on Windows without Docker:
1. Download and run the PostgreSQL 16 installer from [enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2. Set a password for user `postgres` (e.g. `postgres` or `admin`).
3. Open **SQL Shell (psql)** or **pgAdmin 4** from your Windows Start Menu and run:
   ```sql
   CREATE DATABASE engineering_intelligence;
   \c engineering_intelligence;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

---

## 🤖 Step 3: Start Ollama on Windows

1. Launch the **Ollama** application from your Windows Start Menu (or system tray).
2. Open **PowerShell** and pull the LLM model:
   ```powershell
   ollama pull gemma3:12b-it-q4_K_M
   ```
   *(💡 If your office laptop has 8GB–16GB RAM without a dedicated Nvidia GPU, pull the faster model: `ollama pull qwen2.5:7b` or `ollama pull llama3.2:3b`)*

---

## 🐍 Step 4: Setup Backend (FastAPI on Windows)

Open a **PowerShell** window in `engineering-intelligence`:

```powershell
# 1. Navigate to backend
cd backend

# 2. Allow PowerShell script execution (one-time command for venv on Windows)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Create virtual environment
python -m venv .venv

# 4. Activate virtual environment on Windows
.\.venv\Scripts\Activate.ps1

# 5. Install all dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# 6. Create your .env file
copy ..\.env.example .env
```

### Configure your `.env` file on Windows:
Open `.env` (in VS Code or Notepad) and update your Database URL and GitHub Token:

```ini
# PostgreSQL (Default Windows postgres user)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/engineering_intelligence
DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/engineering_intelligence

# GitHub Personal Access Token (from https://github.com/settings/tokens)
GITHUB_TOKEN=ghp_your_token_here

# Ollama LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b-it-q4_K_M
```

```powershell
# 7. Start the backend server!
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend will start on:* `http://localhost:8000`  
*API Docs available at:* `http://localhost:8000/docs`

---

## 🎨 Step 5: Setup Frontend (Next.js 14 on Windows)

Open a **second PowerShell window**:

```powershell
cd C:\Users\$env:USERNAME\Desktop\engineering-intelligence\frontend

# Install dependencies
npm install

# Start Next.js server
npm run dev
```
*Frontend UI will start on:* **`http://localhost:3000`**

---

## 🧪 Step 6: Verify the Setup

1. Open **[http://localhost:3000](http://localhost:3000)** in your browser (Edge / Chrome).
2. (Optional) In your backend PowerShell window, seed instant offline test data:
   ```powershell
   python scripts\seed_demo_data.py
   ```
3. Or go to **Tracked Repositories** on the Dashboard, enter your repository name (e.g. `Ratan10067/auth-service-demo` or your office repo), and click **Sync Now**!

---

## 🛑 Common Windows Gotchas & Fixes

| Issue | Root Cause & Solution |
| :--- | :--- |
| **`cannot be loaded because running scripts is disabled`** | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` in PowerShell. |
| **`python is not recognized`** | Re-run Python installer and check **"Add Python to PATH"**, or use `py -m venv .venv`. |
| **`pgvector extension not found`** | If using native Windows installer without Docker, download pre-compiled pgvector Windows DLL from [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector#windows) or use the Docker one-liner in Step 2. |
| **Path Slashing in Windows** | Always use backslashes `.\.venv\Scripts\Activate.ps1` or forward slashes in PowerShell. |
