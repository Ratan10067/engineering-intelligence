"use client";

import { useState, useEffect } from "react";
import { api, type Repository, type SearchResult } from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";

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

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  async function handleSearch(qText?: string) {
    const q = qText !== undefined ? qText : query;
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params: any = { query: q.trim(), top_k: 20 };
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

  return (
    <div>
      <Header
        title="Search"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      <div className="card">
        {/* Search Bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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

        {/* Filters Bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>Filters:</span>
          <input
            className="input"
            style={{ width: 140, padding: "6px 10px", fontSize: "0.8rem" }}
            placeholder="Release tag..."
            value={release}
            onChange={(e) => setRelease(e.target.value)}
          />
          <input
            className="input"
            style={{ width: 140, padding: "6px 10px", fontSize: "0.8rem" }}
            placeholder="Author username..."
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <select
            className="filter-select"
            value={changeType}
            onChange={(e) => setChangeType(e.target.value)}
          >
            <option value="">All Change Types</option>
            <option value="bugfix">Bugfix</option>
            <option value="feature">Feature</option>
            <option value="performance">Performance</option>
            <option value="refactor">Refactor</option>
            <option value="security">Security</option>
          </select>
          {(release || author || changeType) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRelease("");
                setAuthor("");
                setChangeType("");
              }}
            >
              Clear
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
      ) : searched && results.length === 0 ? (
        <div className="empty-state">
          No matching engineering documents found. Try modifying your search query or filters.
        </div>
      ) : (
        <div>
          {results.length > 0 && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-tertiary)", marginBottom: 10 }}>
              Found {results.length} relevant documents:
            </div>
          )}

          {results.map((r) => (
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
