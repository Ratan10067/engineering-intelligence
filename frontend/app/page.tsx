"use client";

import { useEffect, useState } from "react";
import { api, type Repository, type Stats, type PullRequest } from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";
import { SyncLiveModal } from "@/components/SyncLiveModal";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [recentPrs, setRecentPrs] = useState<PullRequest[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | undefined>();
  const [newRepo, setNewRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncMax, setSyncMax] = useState(10);
  const [activePRId, setActivePRId] = useState<number | null>(null);
  const [syncLiveRepo, setSyncLiveRepo] = useState<Repository | null>(null);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 8000);
    return () => clearInterval(interval);
  }, [selectedRepoId]);

  async function loadDashboardData() {
    try {
      const [s, r] = await Promise.all([api.getStats(), api.getRepositories()]);
      setStats(s);
      setRepos(r);

      const targetRepo = selectedRepoId || (r.length > 0 ? r[0].id : null);
      if (targetRepo) {
        const prData = await api.getPullRequests(targetRepo, 20, 0);
        setRecentPrs(prData.items);
      }
    } catch (e) {
      console.error("Dashboard refresh error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRepo() {
    if (!newRepo.trim()) return;
    try {
      await api.createRepository(newRepo.trim());
      setNewRepo("");
      loadDashboardData();
    } catch (e: any) {
      alert(`Error registering repository: ${e.message}`);
    }
  }

  function handleSync(repo: Repository) {
    setSyncLiveRepo(repo);
  }

  function handleSyncLiveClose() {
    setSyncLiveRepo(null);
    loadDashboardData();
  }

  async function handleCancelSync(repoId: number) {
    try {
      const res = await api.cancelSync(repoId);
      alert(res.message);
      loadDashboardData();
    } catch (e: any) {
      alert(`Cancel error: ${e.message}`);
    }
  }

  return (
    <div>
      <Header
        title="Dashboard"
        selectedRepoId={selectedRepoId}
        onSelectRepo={setSelectedRepoId}
      />

      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.repositories ?? 0}</div>
          <div className="stat-label">Repositories Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.pull_requests ?? 0}</div>
          <div className="stat-label">Pull Requests Indexed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.prs_with_knowledge ?? 0}</div>
          <div className="stat-label">PRs Analyzed by LLM</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.engineering_documents ?? 0}</div>
          <div className="stat-label">Searchable Documents</div>
        </div>
      </div>

      {/* Repositories Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Tracked Repositories</div>
            <div className="card-subtitle">GitHub repositories connected to the intelligence platform</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Sync limit:</span>
            <input
              type="number"
              className="input"
              style={{ width: 72, textAlign: "center", padding: "4px 8px", fontSize: "0.82rem" }}
              min={1}
              max={500}
              value={syncMax}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) setSyncMax(val);
              }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>PRs</span>
            {[10, 20, 50, 100].map((n) => (
              <button
                key={n}
                className={`btn btn-sm ${syncMax === n ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "2px 8px", fontSize: "0.72rem", minWidth: 0 }}
                onClick={() => setSyncMax(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Add repository inline */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="owner/repo (e.g. facebook/react)"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
          />
          <button className="btn btn-primary" onClick={handleAddRepo}>
            Add Repository
          </button>
        </div>

        {/* Repositories Table */}
        {repos.length === 0 ? (
          <div className="empty-state">
            No repositories registered yet. Add a GitHub repository above.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Sync Status</th>
                  <th>PRs Indexed</th>
                  <th>Last Synced</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((r) => {
                  const isSyncing = ["collecting", "understanding", "embedding"].includes(r.sync_status);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                      <td>
                        <span
                          className={`badge ${
                            r.sync_status === "completed"
                              ? "badge-success"
                              : isSyncing
                              ? "badge-warning"
                              : r.sync_status === "failed"
                              ? "badge-danger"
                              : "badge-neutral"
                          }`}
                        >
                          {r.sync_status}
                        </span>
                      </td>
                      <td>{r.total_prs_synced}</td>
                      <td style={{ color: "var(--text-tertiary)" }}>
                        {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : "Never"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            className={`btn btn-sm ${isSyncing ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => handleSync(r)}
                          >
                            {isSyncing ? "📊 View Live" : "Sync Now"}
                          </button>
                          {isSyncing && (
                            <button
                              className="btn btn-sm"
                              style={{ background: "#ef4444", color: "#fff", border: "none" }}
                              onClick={() => handleCancelSync(r.id)}
                              title="Cancel active sync"
                            >
                              Stop
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Pull Requests */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Recent Pull Requests</div>
            <div className="card-subtitle">Indexed GitHub PR activity</div>
          </div>
          <Link href="/search" className="btn btn-secondary btn-sm">
            Search All PRs
          </Link>
        </div>

        {recentPrs.length === 0 ? (
          <div className="empty-state">
            No pull requests indexed yet. Click "Sync Now" on a repository above to start ingestion.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>PR #</th>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Changes</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {recentPrs.map((pr) => (
                  <tr
                    key={pr.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActivePRId(pr.id)}
                  >
                    <td className="font-mono" style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                      #{pr.pr_number}
                    </td>
                    <td style={{ fontWeight: 500 }}>{pr.title}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{pr.author}</td>
                    <td className="font-mono" style={{ fontSize: "0.78rem" }}>
                      <span style={{ color: "#16a34a" }}>+{pr.additions}</span>{" "}
                      <span style={{ color: "#dc2626" }}>-{pr.deletions}</span>
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>
                      {pr.merged_at ? new Date(pr.merged_at).toLocaleDateString() : "N/A"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setActivePRId(pr.id); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PR Detail Modal */}
      <PRDetailModal prId={activePRId} onClose={() => setActivePRId(null)} />

      {/* Live Sync Modal */}
      {syncLiveRepo && (
        <SyncLiveModal
          repoId={syncLiveRepo.id}
          repoName={syncLiveRepo.full_name}
          maxPrs={syncMax}
          onClose={handleSyncLiveClose}
        />
      )}
    </div>
  );
}
