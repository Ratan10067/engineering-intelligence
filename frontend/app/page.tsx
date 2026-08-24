"use client";

import { useEffect, useState } from "react";
import { api, type Repository, type Stats } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [newRepo, setNewRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncMax, setSyncMax] = useState(50);
  const [health, setHealth] = useState<{ ollama: string } | null>(null);

  useEffect(() => {
    loadData();
    checkHealth();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [s, r] = await Promise.all([api.getStats(), api.getRepositories()]);
      setStats(s);
      setRepos(r);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function checkHealth() {
    try {
      const h = await api.healthCheck();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  }

  async function addRepo() {
    if (!newRepo.trim()) return;
    try {
      await api.createRepository(newRepo.trim());
      setNewRepo("");
      loadData();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  async function syncRepo(repoId: number) {
    setSyncing(repoId);
    try {
      const result = await api.syncRepository(repoId, syncMax);
      alert(result.message);
      loadData();
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(null);
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" style={{ width: 40, height: 40 }} />
        <p style={{ marginTop: 16, color: "var(--text-tertiary)" }}>
          Loading dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="header">
        <div className="header-title">📊 Dashboard</div>
        <div className="header-actions">
          <span
            className={`sync-badge ${
              health?.ollama === "connected" ? "completed" : "failed"
            }`}
          >
            <span
              className={`status-dot ${
                health?.ollama !== "connected" ? "disconnected" : ""
              }`}
            />
            Ollama {health?.ollama || "checking..."}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid stagger-children">
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{stats?.repositories ?? 0}</div>
          <div className="stat-label">Repositories</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">🔀</div>
          <div className="stat-value">{stats?.pull_requests ?? 0}</div>
          <div className="stat-label">Pull Requests</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📝</div>
          <div className="stat-value">{stats?.commits ?? 0}</div>
          <div className="stat-label">Commits</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📄</div>
          <div className="stat-value">{stats?.changed_files ?? 0}</div>
          <div className="stat-label">Changed Files</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">🧠</div>
          <div className="stat-value">{stats?.prs_with_knowledge ?? 0}</div>
          <div className="stat-label">PRs Analyzed</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📚</div>
          <div className="stat-value">{stats?.engineering_documents ?? 0}</div>
          <div className="stat-label">Documents</div>
        </div>
      </div>

      {/* Add Repository */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Add Repository</h3>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            className="input"
            placeholder="owner/repository (e.g., facebook/react)"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRepo()}
          />
          <button className="btn btn-primary" onClick={addRepo}>
            Add
          </button>
        </div>
      </div>

      {/* Repositories */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Tracked Repositories</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
              Max PRs:
            </label>
            <select
              className="filter-select"
              value={syncMax}
              onChange={(e) => setSyncMax(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {repos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <div className="empty-state-title">No repositories yet</div>
            <div className="empty-state-desc">
              Add a GitHub repository above to start building your Engineering
              Memory.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="evidence-item"
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div className="evidence-header">
                  <div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        fontSize: "0.95rem",
                      }}
                    >
                      {repo.full_name}
                    </span>
                    <span className={`sync-badge ${repo.sync_status}`} style={{ marginLeft: 12 }}>
                      {repo.sync_status}
                    </span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => syncRepo(repo.id)}
                    disabled={
                      syncing === repo.id ||
                      ["collecting", "understanding", "embedding"].includes(
                        repo.sync_status
                      )
                    }
                  >
                    {syncing === repo.id ? (
                      <span className="loading-spinner" />
                    ) : ["collecting", "understanding", "embedding"].includes(
                        repo.sync_status
                      ) ? (
                      "Syncing..."
                    ) : (
                      "🔄 Sync"
                    )}
                  </button>
                </div>
                <div className="evidence-meta">
                  <span>📊 {repo.total_prs_synced} PRs synced</span>
                  {repo.last_synced_at && (
                    <span>
                      🕐 Last sync:{" "}
                      {new Date(repo.last_synced_at).toLocaleDateString()}
                    </span>
                  )}
                  {repo.description && (
                    <span style={{ maxWidth: 400 }}>📋 {repo.description}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
