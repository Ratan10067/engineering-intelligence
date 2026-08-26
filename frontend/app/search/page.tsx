"use client";

import { useState, useEffect } from "react";
import { api, type Repository, type SearchResult } from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";

const EXAMPLE_SEARCHES = [
  "cache eviction and invalidation",
  "memory leak fix in worker thread",
  "Rust compiler upgrade nightly",
  "authentication token refresh middleware",
  "turbopack build performance",
  "breaking API changes",
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activePRId, setActivePRId] = useState<number | null>(null);

  // Filters
  const [release, setRelease] = useState("");
  const [author, setAuthor] = useState("");
  const [changeType, setChangeType] = useState("");
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  async function handleSearch(qText?: string) {
    const q = qText !== undefined ? qText : query;
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params: any = { query: q.trim(), top_k: 30 };
      if (selectedRepo) params.repo_id = selectedRepo;
      if (release) params.release = release;
      if (author) params.author = author;
      if (changeType) params.change_types = [changeType];

      const res = await api.search(params);
      setResults(res.results);
    } catch (e: any) {
      alert(`Search error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredResults = results.filter(
    (r) => Math.round(r.score * 100) >= minScore
  );

  return (
    <div>
      <Header
        title="Search Engineering Memory"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      <div className="card">
        {/* Search Bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            placeholder="Search engineering documents (e.g., cache eviction, latency regression, PR #834)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Quick Example Queries Carousel */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", flexShrink: 0 }}>Examples:</span>
          <div className="carousel-container" style={{ flex: 1 }}>
            {EXAMPLE_SEARCHES.map((ex, idx) => (
              <button
                key={idx}
                className="tag"
                style={{
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
                onClick={() => {
                  setQuery(ex);
                  handleSearch(ex);
                }}
              >
                🔎 {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Bar */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 500 }}>Filters:</span>
          <input
            className="input"
            style={{ width: 130, padding: "5px 8px", fontSize: "0.78rem" }}
            placeholder="Release tag..."
            value={release}
            onChange={(e) => setRelease(e.target.value)}
          />
          <input
            className="input"
            style={{ width: 130, padding: "5px 8px", fontSize: "0.78rem" }}
            placeholder="Author username..."
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <select
            className="filter-select"
            value={changeType}
            onChange={(e) => setChangeType(e.target.value)}
            style={{ fontSize: "0.78rem", padding: "5px 8px" }}
          >
            <option value="">All Change Types</option>
            <option value="bugfix">Bugfix</option>
            <option value="feature">Feature</option>
            <option value="performance">Performance</option>
            <option value="refactor">Refactor</option>
            <option value="security">Security</option>
          </select>

          {/* Interactive Minimum Match Slider */}
          <div className="range-slider-wrap" style={{ marginLeft: "auto" }} title="Filter minimum semantic match relevance">
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Min Match:</span>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              className="range-slider"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
            <span className="badge badge-neutral font-mono" style={{ fontSize: "0.72rem", minWidth: 42, textAlign: "center" }}>
              {minScore}%
            </span>
          </div>

          {(release || author || changeType || minScore > 0) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRelease("");
                setAuthor("");
                setChangeType("");
                setMinScore(0);
              }}
              style={{ fontSize: "0.75rem", padding: "3px 8px" }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p style={{ marginTop: 8 }}>Searching engineering documents...</p>
        </div>
      ) : searched && filteredResults.length === 0 ? (
        <div className="empty-state">
          No matching engineering documents found for current query and filters.
        </div>
      ) : (
        <div>
          {filteredResults.length > 0 && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-tertiary)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>Found {filteredResults.length} relevant documents:</span>
              {minScore > 0 && <span style={{ color: "var(--accent-primary)" }}>Filtered ≥ {minScore}% match</span>}
            </div>
          )}

          {filteredResults.map((r) => (
            <div
              key={r.document_id}
              className="result-card"
              style={{ cursor: "pointer" }}
              onClick={() => setActivePRId(r.pull_request_id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="font-mono" style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                    PR #{r.pr_number}
                  </span>
                  <span className="badge badge-neutral">
                    {r.document_type.replace(/_/g, " ")}
                  </span>
                  <span className="badge badge-neutral font-mono">
                    {r.source}
                  </span>
                </div>
                <span className="badge badge-success font-mono">
                  {(r.score * 100).toFixed(0)}% match
                </span>
              </div>

              <div className="result-title">{r.title}</div>
              <div className="result-content" style={{ marginBottom: 8 }}>{r.content}</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                {r.author && <span>Author: {r.author}</span>}
                {r.release && <span>Release: {r.release}</span>}
                {r.pr_date && <span>Date: {new Date(r.pr_date).toLocaleDateString()}</span>}
                {r.html_url && (
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginLeft: "auto" }}
                  >
                    View on GitHub ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PR Detail Modal */}
      <PRDetailModal prId={activePRId} onClose={() => setActivePRId(null)} />
    </div>
  );
}
