"use client";

import { useState, useEffect } from "react";
import { api, type Repository, type SearchResult } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Filters
  const [release, setRelease] = useState("");
  const [author, setAuthor] = useState("");
  const [filePattern, setFilePattern] = useState("");
  const [changeType, setChangeType] = useState("");

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params: any = { query: query.trim(), top_k: 15 };
      if (selectedRepo) params.repo_id = selectedRepo;
      if (release) params.release = release;
      if (author) params.author = author;
      if (filePattern) params.file_pattern = filePattern;
      if (changeType) params.change_types = [changeType];

      const res = await api.search(params);
      setResults(res.results);
    } catch (e: any) {
      alert(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function getDocTypeBadge(type: string) {
    const map: Record<string, string> = {
      pr_summary: "badge-indigo",
      pr_description: "badge-violet",
      review_discussion: "badge-cyan",
      file_change_summary: "badge-emerald",
      architecture_decision: "badge-amber",
      issue_fix: "badge-rose",
    };
    return map[type] || "badge-indigo";
  }

  function getSourceBadge(source: string) {
    const map: Record<string, string> = {
      vector: "badge-violet",
      keyword: "badge-cyan",
      metadata: "badge-emerald",
    };
    return map[source] || "badge-indigo";
  }

  return (
    <div className="animate-fade-in">
      <div className="header">
        <div className="header-title">🔍 Search Engineering History</div>
      </div>

      {/* Search Bar */}
      <div className="question-section">
        <h2 className="question-title">Search Engineering Memory</h2>
        <p className="question-subtitle">
          Find PRs, code changes, reviews, and engineering decisions
        </p>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            className="input"
            placeholder="Search PRs, files, components, changes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? <span className="loading-spinner" /> : "Search"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        {repos.length > 0 && (
          <select
            className="filter-select"
            value={selectedRepo || ""}
            onChange={(e) =>
              setSelectedRepo(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">All Repos</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        )}
        <input
          className="filter-select"
          placeholder="Release..."
          value={release}
          onChange={(e) => setRelease(e.target.value)}
          style={{ width: 120 }}
        />
        <input
          className="filter-select"
          placeholder="Author..."
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          style={{ width: 120 }}
        />
        <input
          className="filter-select"
          placeholder="File pattern..."
          value={filePattern}
          onChange={(e) => setFilePattern(e.target.value)}
          style={{ width: 150 }}
        />
        <select
          className="filter-select"
          value={changeType}
          onChange={(e) => setChangeType(e.target.value)}
        >
          <option value="">Change Type</option>
          <option value="bugfix">Bugfix</option>
          <option value="feature">Feature</option>
          <option value="refactor">Refactor</option>
          <option value="performance">Performance</option>
          <option value="security">Security</option>
          <option value="documentation">Documentation</option>
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="empty-state">
          <div className="loading-dots">
            <span /><span /><span />
          </div>
          <p style={{ marginTop: 16, color: "var(--text-tertiary)" }}>
            Searching across engineering documents...
          </p>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No results found</div>
          <div className="empty-state-desc">
            Try different keywords or remove some filters.
          </div>
        </div>
      ) : (
        <div className="results-grid stagger-children">
          {results.length > 0 && (
            <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem", marginBottom: 8 }}>
              Found {results.length} results
            </p>
          )}
          {results.map((r, idx) => (
            <div key={r.document_id} className="result-card animate-fade-in">
              <div className="result-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="result-pr-number">PR #{r.pr_number}</span>
                  <span className={`badge ${getDocTypeBadge(r.document_type)}`}>
                    {r.document_type.replace(/_/g, " ")}
                  </span>
                  <span className={`badge ${getSourceBadge(r.source)}`}>
                    {r.source}
                  </span>
                </div>
                <span className="evidence-score">
                  {(r.score * 100).toFixed(1)}% match
                </span>
              </div>
              <div className="result-title">{r.title}</div>
              <div className="result-content">{r.content}</div>
              <div className="result-tags">
                {r.author && <span className="tag">👤 {r.author}</span>}
                {r.pr_date && (
                  <span className="tag">
                    📅 {new Date(r.pr_date).toLocaleDateString()}
                  </span>
                )}
                {r.release && <span className="tag">🏷️ {r.release}</span>}
                {r.components?.map((c) => (
                  <span key={c} className="tag">
                    📦 {c}
                  </span>
                ))}
                {r.html_url && (
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tag"
                    style={{ color: "var(--accent-indigo)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 GitHub
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
