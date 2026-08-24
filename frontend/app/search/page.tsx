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

  // Faceted Filters
  const [release, setRelease] = useState("");
  const [author, setAuthor] = useState("");
  const [filePattern, setFilePattern] = useState("");
  const [changeType, setChangeType] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  async function handleSearch(overrideQuery?: string) {
    const q = overrideQuery !== undefined ? overrideQuery : query;
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params: any = { query: q.trim(), top_k: 20 };
      if (selectedRepo) params.repo_id = selectedRepo;
      if (release) params.release = release;
      if (author) params.author = author;
      if (filePattern) params.file_pattern = filePattern;
      if (changeType) params.change_types = [changeType];

      const res = await api.search(params);
      setResults(res.results);
    } catch (e: any) {
      alert(`Search error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleTagClick(tagQuery: string) {
    setQuery(tagQuery);
    handleSearch(tagQuery);
  }

  function exportResults(format: "json" | "md") {
    if (!results.length) return;
    let dataStr = "";
    if (format === "json") {
      dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    } else {
      let md = `# Engineering Intelligence Search Export\n\nQuery: "${query}"\nDate: ${new Date().toISOString()}\nTotal Results: ${results.length}\n\n`;
      results.forEach((r, idx) => {
        md += `### ${idx + 1}. PR #${r.pr_number}: ${r.title}\n`;
        md += `- **Score:** ${(r.score * 100).toFixed(1)}% (${r.source})\n`;
        md += `- **Type:** ${r.document_type}\n`;
        if (r.author) md += `- **Author:** ${r.author}\n`;
        if (r.release) md += `- **Release:** ${r.release}\n`;
        if (r.html_url) md += `- **GitHub:** ${r.html_url}\n`;
        md += `\n> ${r.content.replace(/\n/g, "\n> ")}\n\n---\n\n`;
      });
      dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    }
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `eng-search-${Date.now()}.${format}`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="🔍 Hybrid Search Engine"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      {/* Search Header Banner */}
      <div className="question-section" style={{ marginBottom: 28 }}>
        <h2 className="question-title">Search Engineering Knowledge</h2>
        <p className="question-subtitle">
          Hybrid Vector Search + Full-Text Keywords + Structured Metadata Ranking
        </p>

        {/* Search Input */}
        <div className="search-bar-wrap">
          <div className="search-bar-inner">
            <span className="search-bar-icon">⚡</span>
            <input
              className="input"
              placeholder="Search by keywords, bug symptoms, component names, or file diffs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <div className="search-bar-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  background: showFilters ? "rgba(99, 102, 241, 0.2)" : undefined,
                  borderColor: showFilters ? "var(--accent-indigo)" : undefined,
                }}
              >
                🎛️ Filters {showFilters ? "▲" : "▼"}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
              >
                {loading ? <span className="loading-spinner" /> : "Search"}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Tag Pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", alignSelf: "center" }}>
            Suggested:
          </span>
          <button className="tag" onClick={() => handleTagClick("cache eviction memory optimization")}>
            #memory-cache
          </button>
          <button className="tag" onClick={() => handleTagClick("performance latency regression")}>
            #latency-regression
          </button>
          <button className="tag" onClick={() => handleTagClick("architectural refactor")}>
            #architecture-rewrite
          </button>
          <button className="tag" onClick={() => handleTagClick("security vulnerability fix")}>
            #security-patch
          </button>
          <button className="tag" onClick={() => handleTagClick("database connection pooling")}>
            #database-pool
          </button>
        </div>
      </div>

      {/* Faceted Filters Drawer */}
      {showFilters && (
        <div className="card animate-fade-in" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Faceted Metadata Filters
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRelease("");
                setAuthor("");
                setFilePattern("");
                setChangeType("");
              }}
            >
              Reset Filters
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                RELEASE TAG:
              </label>
              <input
                className="input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                placeholder="e.g. v5.3 or 1.2"
                value={release}
                onChange={(e) => setRelease(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                AUTHOR USERNAME:
              </label>
              <input
                className="input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                placeholder="e.g. octocat"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                FILE PATH PATTERN:
              </label>
              <input
                className="input"
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
                placeholder="e.g. src/cache/*.cpp"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                CHANGE CLASSIFICATION:
              </label>
              <select
                className="filter-select"
                style={{ width: "100%", padding: "8px 12px" }}
                value={changeType}
                onChange={(e) => setChangeType(e.target.value)}
              >
                <option value="">All Change Types</option>
                <option value="bugfix">Bugfix</option>
                <option value="feature">Feature</option>
                <option value="performance">Performance</option>
                <option value="refactor">Refactor</option>
                <option value="security">Security</option>
                <option value="documentation">Documentation</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Search Results Area */}
      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" style={{ width: 44, height: 44 }} />
          <p style={{ marginTop: 16, color: "var(--text-tertiary)", fontSize: "0.95rem" }}>
            Executing Hybrid Search (Vector + Full-Text + RRF Fusion)...
          </p>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No matching engineering documents</div>
          <div className="empty-state-desc">
            Try adjusting keywords, broadening filters, or indexing more PRs on the Dashboard.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {results.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: "0.88rem", color: "var(--text-tertiary)" }}>
                Found <strong>{results.length}</strong> engineering documents ranked by Reciprocal Rank Fusion
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResults("md")}>
                  📥 Export Markdown
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportResults("json")}>
                  Export JSON
                </button>
              </div>
            </div>
          )}

          <div className="results-grid stagger-children">
            {results.map((r) => (
              <div
                key={r.document_id}
                className="result-card animate-fade-in"
                onClick={() => setActivePRId(r.pull_request_id)}
              >
                <div className="result-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="result-pr-number">PR #{r.pr_number}</span>
                    <span className="badge badge-indigo">
                      {r.document_type.replace(/_/g, " ")}
                    </span>
                    <span className={`badge ${r.source === "vector" ? "badge-violet" : "badge-cyan"}`}>
                      {r.source}
                    </span>
                    {r.release && <span className="tag">🏷️ {r.release}</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="evidence-score" style={{ fontFamily: "JetBrains Mono" }}>
                      Score: {(r.score * 100).toFixed(1)}%
                    </span>
                  </div>
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
                  {r.components?.map((c) => (
                    <span key={c} className="badge badge-cyan">
                      📦 {c}
                    </span>
                  ))}
                  {r.change_types?.map((ct) => (
                    <span key={ct} className="badge badge-violet">
                      🏷️ {ct}
                    </span>
                  ))}
                  <span className="tag" style={{ marginLeft: "auto", color: "var(--accent-indigo)" }}>
                    Click to Inspect PR Memory ↗
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PR Detail Modal */}
      <PRDetailModal prId={activePRId} onClose={() => setActivePRId(null)} />
    </div>
  );
}
