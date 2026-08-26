"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type Repository, type ReleaseNotesStats } from "@/lib/api";
import { Header } from "@/components/Header";

// Helper to clean SentencePiece artifacts and repeated underscores in markdown
function cleanReleaseMarkdown(text: string): string {
  if (!text) return "";
  let s = text.replace(/[\u2580-\u259F]/g, " ");
  s = s.replace(/_{2,}\*_{2,}/g, "\n* ");
  s = s.replace(/_{2,}(?=\w)/g, "\n- ");
  s = s.replace(/_{3,}/g, " ");
  return s;
}

export default function ReleasesPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();

  // Configuration options
  const [releaseVersion, setReleaseVersion] = useState("v15.2.0 — Engineering Milestone");
  const [targetAudience, setTargetAudience] = useState<"executive" | "engineers" | "public">("executive");
  const [prLimit, setPrLimit] = useState(25);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [markdownOutput, setMarkdownOutput] = useState("");
  const [stats, setStats] = useState<ReleaseNotesStats | null>(null);
  const [activeReleaseTitle, setActiveReleaseTitle] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getRepositories().then((data) => {
      setRepos(data);
      if (data.length > 0) {
        setSelectedRepo(data[0].id);
      }
    }).catch(console.error);
  }, []);

  const handleGenerate = async () => {
    if (!selectedRepo || isGenerating) return;

    setIsGenerating(true);
    setMarkdownOutput("");
    setStats(null);
    setActiveReleaseTitle(releaseVersion.trim() || "Release Notes");

    try {
      await api.streamReleaseNotes(
        {
          repo_id: selectedRepo,
          limit: prLimit,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          target_audience: targetAudience,
          release_version: releaseVersion.trim() || undefined,
        },
        {
          onInit: (initData) => {
            setStats(initData.stats);
            if (initData.release_title) {
              setActiveReleaseTitle(initData.release_title);
            }
          },
          onToken: (token) => {
            setMarkdownOutput((prev) => prev + token);
          },
          onDone: () => {
            setIsGenerating(false);
          },
          onError: (err) => {
            alert(`Release Notes generation failed: ${err.message}`);
            setIsGenerating(false);
          },
        }
      );
    } catch (err: any) {
      alert(`Generation error: ${err.message}`);
      setIsGenerating(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!markdownOutput) return;
    navigator.clipboard.writeText(markdownOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!markdownOutput) return;
    const blob = new Blob([markdownOutput], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeReleaseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "release-notes"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Header
        title="Release Intelligence & Executive Changelogs"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      {/* Configuration & Controls Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 style={{ fontSize: "1.05rem" }}>🚀 AI Release Notes & Migration Guide Synthesizer</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-tertiary)", marginTop: 2 }}>
              Synthesizes merged pull requests, architectural decisions, and breaking changes into publication-ready release documents.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
          {/* Release Version Input */}
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Release Title / Milestone:
            </label>
            <input
              type="text"
              className="input"
              value={releaseVersion}
              onChange={(e) => setReleaseVersion(e.target.value)}
              placeholder="e.g. v15.2.0 (Summer '26 Release)"
            />
          </div>

          {/* Target Audience Tone */}
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Target Audience / Tone:
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "executive", label: "💼 Executive Brief", desc: "Business & leadership value" },
                { id: "engineers", label: "🛠️ Deep Technical", desc: "Architecture & migration" },
                { id: "public", label: "🌐 Public Changelog", desc: "GitHub Release style" },
              ].map((aud) => (
                <button
                  key={aud.id}
                  type="button"
                  className={`btn btn-sm ${targetAudience === aud.id ? "btn-primary" : "btn-secondary"}`}
                  style={{ flex: 1, padding: "6px 8px", fontSize: "0.78rem" }}
                  onClick={() => setTargetAudience(aud.id as any)}
                  title={aud.desc}
                >
                  {aud.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PR Scope & Date Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* PR Limit Slider */}
            <div className="range-slider-wrap">
              <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>PR Scope:</span>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                className="range-slider"
                value={prLimit}
                onChange={(e) => setPrLimit(Number(e.target.value))}
                title={`Synthesize up to ${prLimit} merged PRs`}
              />
              <span className="badge badge-neutral font-mono" style={{ fontWeight: 600, minWidth: 54, textAlign: "center" }}>
                {prLimit} PRs
              </span>
            </div>

            {/* Quick Limit Presets */}
            <div style={{ display: "flex", gap: 4 }}>
              {[10, 25, 50].map((n) => (
                <button
                  key={n}
                  className={`btn btn-sm ${prLimit === n ? "btn-primary" : "btn-secondary"}`}
                  style={{ padding: "2px 6px", fontSize: "0.72rem" }}
                  onClick={() => setPrLimit(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Date Range Toggle */}
            <button
              className={`btn btn-sm ${showDateFilter || fromDate || toDate ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: "0.75rem", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setShowDateFilter(!showDateFilter)}
            >
              <span>📅</span>
              {fromDate || toDate ? `${fromDate || "Start"} → ${toDate || "Latest"}` : "Date Filter (Optional)"}
            </button>
          </div>

          {/* Action Button */}
          <button
            className="btn btn-primary"
            style={{ padding: "8px 20px", fontWeight: 600 }}
            onClick={handleGenerate}
            disabled={isGenerating || !selectedRepo}
          >
            {isGenerating ? "Synthesizing Release..." : "✨ Generate Release Notes"}
          </button>
        </div>

        {/* Expandable Date Range Picker */}
        {showDateFilter && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>From:</span>
              <input
                type="date"
                className="input"
                style={{ fontSize: "0.78rem", padding: "3px 6px", width: 140 }}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>To:</span>
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
              {(fromDate || toDate) && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Release Metrics & Stats Bar */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>
              Analyzed Scope
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4, color: "var(--accent-primary)" }}>
              {stats.total_prs} <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-secondary)" }}>PRs</span>
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>
              Code Velocity
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>
              <span style={{ color: "#16a34a" }}>+{stats.total_additions.toLocaleString()}</span>{" "}
              <span style={{ color: "#dc2626", fontSize: "1.1rem" }}>-{stats.total_deletions.toLocaleString()}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>
              Contributors
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>
              {stats.authors_count} <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-secondary)" }}>Authors</span>
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 600 }}>
              Impact Areas
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>
              {stats.components.length} <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-secondary)" }}>Subsystems</span>
            </div>
          </div>
        </div>
      )}

      {/* Generated Release Document */}
      {(markdownOutput || isGenerating) && (
        <div className="card">
          {/* Document Actions Bar */}
          <div className="card-header" style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.1rem" }}>📋</span>
              <span style={{ fontWeight: 600, fontSize: "1rem" }}>{activeReleaseTitle}</span>
              <span className="badge badge-success font-mono" style={{ textTransform: "capitalize" }}>
                {targetAudience}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyMarkdown}
                disabled={!markdownOutput}
              >
                {copied ? "✓ Copied Markdown" : "📋 Copy Markdown"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadMarkdown}
                disabled={!markdownOutput}
              >
                💾 Export .md
              </button>
            </div>
          </div>

          {/* Document Content */}
          <div className="answer-text markdown-content" style={{ marginTop: 14 }}>
            {markdownOutput ? (
              <div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cleanReleaseMarkdown(markdownOutput)}
                </ReactMarkdown>
                {isGenerating && (
                  <div style={{ display: "inline-flex", alignItems: "center", marginTop: 6 }}>
                    <span className="streaming-cursor">
                      <span className="streaming-spark-icon">✦</span>
                      <span className="streaming-cursor-bar" />
                    </span>
                  </div>
                )}
              </div>
            ) : isGenerating ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontStyle: "italic", padding: "20px 0" }}>
                <span className="streaming-spark-icon">✦</span>
                <span>Synthesizing engineering memory and generating release document...</span>
                <span className="streaming-cursor-bar" />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!markdownOutput && !isGenerating && (
        <div className="empty-state" style={{ padding: "60px 20px" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🚀</div>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Ready to Synthesize Your Next Release</h3>
          <p style={{ color: "var(--text-secondary)", maxWidth: 520, margin: "0 auto", fontSize: "0.88rem" }}>
            Select a target repository, configure your audience tone, and click <strong>Generate Release Notes</strong> to produce executive summaries, breaking change registers, and performance reports instantly.
          </p>
        </div>
      )}
    </div>
  );
}
