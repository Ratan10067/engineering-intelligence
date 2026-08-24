"use client";

import { useEffect, useState } from "react";
import { api, type Repository, type Stats, type PullRequest } from "@/lib/api";
import { Header } from "@/components/Header";
import { ScenarioCards } from "@/components/ScenarioCards";
import { PRDetailModal } from "@/components/PRDetailModal";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [recentPrs, setRecentPrs] = useState<PullRequest[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | undefined>();
  const [newRepo, setNewRepo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingRepoId, setSyncingRepoId] = useState<number | null>(null);
  const [syncMax, setSyncMax] = useState(50);
  const [activePRId, setActivePRId] = useState<number | null>(null);

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

      // Load PRs for the selected repo or the first available repo
      const targetRepo = selectedRepoId || (r.length > 0 ? r[0].id : null);
      if (targetRepo) {
        const prData = await api.getPullRequests(targetRepo, 15, 0);
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

  async function handleSync(repoId: number) {
    setSyncingRepoId(repoId);
    try {
      const res = await api.syncRepository(repoId, syncMax);
      alert(res.message);
      loadDashboardData();
    } catch (e: any) {
      alert(`Sync trigger failed: ${e.message}`);
    } finally {
      setSyncingRepoId(null);
    }
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="📊 Engineering Overview"
        selectedRepoId={selectedRepoId}
        onSelectRepo={setSelectedRepoId}
      />

      {/* Hero Banner */}
      <div className="hero-banner">
        <div className="hero-content">
          <h2>Engineering Intelligence Memory</h2>
          <p>
            Autonomous historical knowledge extractor. Transforming raw PR diffs, review discussions, and commit trees into structured, searchable engineering decisions.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Link href="/questions" className="btn btn-primary btn-sm">
              💬 Launch Evidence Q&A
            </Link>
            <Link href="/search" className="btn btn-secondary btn-sm">
              🔍 Explore Semantic Search
            </Link>
          </div>
        </div>
      </div>

      {/* Live System Stats */}
      <div className="stats-grid stagger-children">
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{stats?.repositories ?? 0}</div>
          <div className="stat-label">Repositories</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">🔀</div>
          <div className="stat-value">{stats?.pull_requests ?? 0}</div>
          <div className="stat-label">Indexed PRs</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">🧠</div>
          <div className="stat-value">{stats?.prs_with_knowledge ?? 0}</div>
          <div className="stat-label">AI Understandings</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📚</div>
          <div className="stat-value">{stats?.engineering_documents ?? 0}</div>
          <div className="stat-label">Searchable Vectors</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">📄</div>
          <div className="stat-value">{stats?.changed_files ?? 0}</div>
          <div className="stat-label">Changed Files</div>
        </div>
        <div className="stat-card animate-fade-in">
          <div className="stat-icon">💬</div>
          <div className="stat-value">{stats?.reviews ?? 0}</div>
          <div className="stat-label">Reviews & Comments</div>
        </div>
      </div>

      {/* Scenario Quick Launch */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 className="card-title">🎯 Target Scenarios</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
            Instant evidence-backed analysis
          </span>
        </div>
        <ScenarioCards />
      </div>

      {/* Repositories & Ingestion Control */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24, marginBottom: 32 }}>
        {/* Tracked Repositories */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📁 Tracked Repositories</div>
              <div className="card-subtitle">Active GitHub sources</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Depth:</span>
              <select
                className="filter-select"
                style={{ padding: "4px 24px 4px 10px", fontSize: "0.78rem" }}
                value={syncMax}
                onChange={(e) => setSyncMax(Number(e.target.value))}
              >
                <option value={10}>10 PRs</option>
                <option value={50}>50 PRs</option>
                <option value={100}>100 PRs</option>
                <option value={500}>500 PRs</option>
              </select>
            </div>
          </div>

          {/* Add Repository Input */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <input
              className="input"
              style={{ fontSize: "0.85rem", padding: "10px 14px" }}
              placeholder="owner/repo (e.g. facebook/react)"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddRepo}>
              + Register
            </button>
          </div>

          {/* Repo List */}
          {repos.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 16px" }}>
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-title">No repositories registered yet</div>
              <div className="empty-state-desc">Register a GitHub repo above to begin data ingestion.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {repos.map((r) => {
                const isSyncing = ["collecting", "understanding", "embedding"].includes(r.sync_status) || syncingRepoId === r.id;
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: "14px 16px",
                      background: selectedRepoId === r.id ? "rgba(99, 102, 241, 0.12)" : "var(--bg-glass)",
                      border: selectedRepoId === r.id ? "1px solid var(--accent-indigo)" : "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "all var(--transition-fast)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>
                          {r.full_name}
                        </span>
                        <span
                          className={`badge ${
                            r.sync_status === "completed"
                              ? "badge-documented"
                              : isSyncing
                              ? "badge-indigo"
                              : r.sync_status === "failed"
                              ? "badge-unknown"
                              : "badge-inferred"
                          }`}
                        >
                          {r.sync_status}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 4 }}>
                        {r.total_prs_synced} PRs synced · {r.last_synced_at ? `Last sync: ${new Date(r.last_synced_at).toLocaleTimeString()}` : "Never synced"}
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSync(r.id)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? "⚡ Processing..." : "🔄 Ingest"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sync Pipeline Architecture Visualizer */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">⚙️ Ingestion & RAG Pipeline</div>
              <div className="card-subtitle">End-to-end memory pipeline status</div>
            </div>
            <span className="badge badge-documented">Automated</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-glass)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(99, 102, 241, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-indigo)", fontWeight: 700 }}>
                1
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Deterministic GitHub Collection</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>Fetches PRs, commits, diffs, reviews & discussions via REST API</div>
              </div>
              <span className="badge badge-documented">Idempotent</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-glass)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(139, 92, 246, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-violet)", fontWeight: 700 }}>
                2
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>LLM Understanding (Ollama)</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>Extracts summaries, motivations, components, and evidence classification</div>
              </div>
              <span className="badge badge-violet">gemma3:12b</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-glass)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(6, 182, 212, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-cyan)", fontWeight: 700 }}>
                3
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Vector & Keyword Indexing</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>Generates 384-dim embeddings & PostgreSQL full-text search tsvectors</div>
              </div>
              <span className="badge badge-cyan">pgvector</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-glass)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(16, 185, 129, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-emerald)", fontWeight: 700 }}>
                4
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Hybrid RAG & Evidence Grounding</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>Reciprocal Rank Fusion with strict hallucination controls</div>
              </div>
              <span className="badge badge-documented">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent PR Activity Stream */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">🔀 Recent Engineering Pull Requests</div>
            <div className="card-subtitle">Click any pull request to inspect extracted knowledge and diffs</div>
          </div>
          <Link href="/search" className="btn btn-secondary btn-sm">
            View All in Search ↗
          </Link>
        </div>

        {recentPrs.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px 16px" }}>
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No pull requests indexed yet</div>
            <div className="empty-state-desc">
              Run ingestion on a repository above to browse PRs and their engineering memory.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recentPrs.map((pr) => (
              <div
                key={pr.id}
                className="pr-row"
                onClick={() => setActivePRId(pr.id)}
              >
                <span className="pr-number-pill">#{pr.pr_number}</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.92rem" }}>
                    {pr.title}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    <span>👤 {pr.author}</span>
                    {pr.milestone && <span>🏷️ {pr.milestone}</span>}
                    <span>📄 {pr.changed_files_count} files</span>
                  </div>
                </div>
                <div>
                  <span className={`badge ${pr.is_merged ? "badge-documented" : "badge-indigo"}`}>
                    {pr.is_merged ? "Merged" : pr.state}
                  </span>
                </div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem" }}>
                  <span style={{ color: "#4ade80" }}>+{pr.additions}</span>{" "}
                  <span style={{ color: "#f87171" }}>-{pr.deletions}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                  {pr.merged_at ? new Date(pr.merged_at).toLocaleDateString() : "N/A"}
                </div>
                <div>
                  <button className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }}>
                    Inspect ↗
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PR Detail Modal */}
      <PRDetailModal prId={activePRId} onClose={() => setActivePRId(null)} />
    </div>
  );
}
