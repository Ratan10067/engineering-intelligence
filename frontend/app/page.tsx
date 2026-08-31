"use client";

import { useEffect, useState } from "react";
import { api, type Repository, type Stats, type PullRequest } from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";
import { useSync } from "@/context/SyncContext";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [recentPrs, setRecentPrs] = useState<PullRequest[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | undefined>();
  const [newRepo, setNewRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncMax, setSyncMax] = useState(10);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [activePRId, setActivePRId] = useState<number | null>(null);
  const sync = useSync();

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
    if (sync.activeRepo?.id === repo.id && sync.isSyncing) {
      sync.openModal(repo);
    } else {
      sync.startSync(
        repo,
        syncMax,
        fromDate.trim() ? fromDate.trim() : undefined,
        toDate.trim() ? toDate.trim() : undefined
      );
    }
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Sync limit:</span>
              <div className="range-slider-wrap">
                <input
                  type="range"
                  min={5}
                  max={1000000}
                  step={5}
                  className="range-slider"
                  value={syncMax}
                  onChange={(e) => setSyncMax(Number(e.target.value))}
                  title={`Adjust PR sync limit: ${syncMax}`}
                />
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  className="input font-mono"
                  style={{ width: 90, padding: "2px 6px", fontSize: "0.78rem", textAlign: "center" }}
                  value={syncMax}
                  onChange={(e) => setSyncMax(Math.max(1, Number(e.target.value) || 1))}
                  title="Enter arbitrary PR sync limit (up to 1,000,000)"
                />
              </div>
              {[10, 50, 100, 500, 1000].map((n) => (
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

            <button
              className={`btn btn-sm ${showDateFilter || fromDate || toDate ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: "0.75rem", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={() => setShowDateFilter(!showDateFilter)}
            >
              <span>📅</span>
              {fromDate || toDate
                ? `${fromDate || "Start"} → ${toDate || "Latest"}`
                : "Date Range (Optional)"}
            </button>
          </div>
        </div>

        {/* Expandable Date Range Picker */}
        {showDateFilter && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--surface-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 500 }}>From:</span>
                <input
                  type="date"
                  className="input"
                  style={{ fontSize: "0.78rem", padding: "3px 6px", width: 140 }}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 500 }}>To:</span>
                <input
                  type="date"
                  className="input"
                  style={{ fontSize: "0.78rem", padding: "3px 6px", width: 140 }}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>Presets:</span>
                <button
                  className="tag"
                  style={{ cursor: "pointer", fontSize: "0.72rem" }}
                  onClick={() => {
                    setFromDate("2026-01-01");
                    setToDate("2026-07-31");
                  }}
                >
                  Jan &apos;26 – Jul &apos;26
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer", fontSize: "0.72rem" }}
                  onClick={() => {
                    setFromDate("2026-01-01");
                    setToDate("2026-03-31");
                  }}
                >
                  Q1 2026
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer", fontSize: "0.72rem" }}
                  onClick={() => {
                    setFromDate("2026-04-01");
                    setToDate("2026-06-30");
                  }}
                >
                  Q2 2026
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer", fontSize: "0.72rem" }}
                  onClick={() => {
                    setFromDate("2026-01-01");
                    setToDate("");
                  }}
                >
                  2026 YTD
                </button>
                {(fromDate || toDate) && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "1px 6px", fontSize: "0.7rem", color: "#ef4444" }}
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                    }}
                  >
                    ✕ Clear (Latest)
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
              {fromDate || toDate ? (
                <span>
                  Only PRs merged/created between <strong>{fromDate || "the beginning"}</strong> and{" "}
                  <strong>{toDate || "now"}</strong> will be fetched during sync.
                </span>
              ) : (
                <span>Leave blank to fetch the latest PRs newest first.</span>
              )}
            </div>
          </div>
        )}

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
    </div>
  );
}
