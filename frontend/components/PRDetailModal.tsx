"use client";

import { useEffect, useState } from "react";
import { api, type PullRequest, type ChangedFile, type CommitInfo, type CommitDiffResponse } from "@/lib/api";

interface PRDetailModalProps {
  prId: number | null;
  onClose: () => void;
}

// ── Unified Code Diff Viewer Component ─────────────────────────────────────

function CodeDiffView({ patch, filename }: { patch?: string | null; filename: string }) {
  const [copied, setCopied] = useState(false);

  if (!patch) {
    return (
      <div style={{ padding: "12px", fontSize: "0.8rem", color: "var(--text-tertiary)", fontStyle: "italic" }}>
        No text diff available (binary file or empty change).
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = patch.split("\n");

  return (
    <div className="diff-container">
      <div className="diff-header">
        <span className="diff-filename font-mono">{filename}</span>
        <button className="btn btn-secondary btn-sm" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={handleCopy}>
          {copied ? "✓ Copied" : "Copy Diff"}
        </button>
      </div>
      <div className="diff-body font-mono">
        {lines.map((line, idx) => {
          let lineType = "context";
          if (line.startsWith("@@")) lineType = "chunk-header";
          else if (line.startsWith("+")) lineType = "addition";
          else if (line.startsWith("-")) lineType = "deletion";

          return (
            <div key={idx} className={`diff-line diff-line--${lineType}`}>
              <span className="diff-line-num">{idx + 1}</span>
              <span className="diff-line-text">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main PRDetailModal Component ───────────────────────────────────────────

export function PRDetailModal({ prId, onClose }: PRDetailModalProps) {
  const [pr, setPr] = useState<PullRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"knowledge" | "files" | "commits">("knowledge");

  // Expanded file diffs (Set of filenames)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // On-demand commit diffs: Map of commit SHA -> CommitDiffResponse
  const [commitDiffs, setCommitDiffs] = useState<Record<string, CommitDiffResponse>>({});
  const [loadingCommitSha, setLoadingCommitSha] = useState<string | null>(null);
  const [expandedCommitShas, setExpandedCommitShas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!prId) return;
    setLoading(true);
    setExpandedFiles(new Set());
    setCommitDiffs({});
    setExpandedCommitShas(new Set());

    api.getPullRequest(prId)
      .then(setPr)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [prId]);

  if (!prId) return null;

  const toggleFile = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const expandAllFiles = () => {
    if (!pr?.changed_files) return;
    if (expandedFiles.size === pr.changed_files.length) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(pr.changed_files.map((f) => f.filename)));
    }
  };

  const handleInspectCommit = async (sha: string) => {
    if (expandedCommitShas.has(sha)) {
      setExpandedCommitShas((prev) => {
        const next = new Set(prev);
        next.delete(sha);
        return next;
      });
      return;
    }

    // Fetch on-demand if not already cached in memory
    if (!commitDiffs[sha]) {
      setLoadingCommitSha(sha);
      try {
        const diffData = await api.getCommitDiff(prId, sha);
        setCommitDiffs((prev) => ({ ...prev, [sha]: diffData }));
        setExpandedCommitShas((prev) => new Set(prev).add(sha));
      } catch (err: any) {
        alert(`Failed to fetch commit diff: ${err.message}`);
      } finally {
        setLoadingCommitSha(null);
      }
    } else {
      setExpandedCommitShas((prev) => new Set(prev).add(sha));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 960, width: "94%" }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="font-mono" style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "1rem" }}>
                PR #{pr?.pr_number}
              </span>
              <span className={`badge ${pr?.is_merged ? "badge-success" : "badge-neutral"}`}>
                {pr?.is_merged ? "Merged" : pr?.state}
              </span>
              {pr?.html_url && (
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.78rem", marginLeft: 4, color: "var(--accent-primary)" }}
                >
                  GitHub ↗
                </a>
              )}
            </div>
            <h3 style={{ fontSize: "1.15rem", lineHeight: 1.3 }}>{pr?.title || "Loading..."}</h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Modal Tabs */}
        <div style={{ padding: "0 20px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-sm"
              style={{
                borderRadius: "4px 4px 0 0",
                background: activeTab === "knowledge" ? "var(--bg-subtle)" : "transparent",
                fontWeight: activeTab === "knowledge" ? 600 : 400,
                color: activeTab === "knowledge" ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
              onClick={() => setActiveTab("knowledge")}
            >
              🧠 AI Knowledge
            </button>
            <button
              className="btn btn-sm"
              style={{
                borderRadius: "4px 4px 0 0",
                background: activeTab === "files" ? "var(--bg-subtle)" : "transparent",
                fontWeight: activeTab === "files" ? 600 : 400,
                color: activeTab === "files" ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
              onClick={() => setActiveTab("files")}
            >
              📄 Changed Files & Diffs ({pr?.changed_files?.length || 0})
            </button>
            <button
              className="btn btn-sm"
              style={{
                borderRadius: "4px 4px 0 0",
                background: activeTab === "commits" ? "var(--bg-subtle)" : "transparent",
                fontWeight: activeTab === "commits" ? 600 : 400,
                color: activeTab === "commits" ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
              onClick={() => setActiveTab("commits")}
            >
              🔍 Commits & Code Inspection ({pr?.commits?.length || 0})
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" />
              <p style={{ marginTop: 8 }}>Loading PR details...</p>
            </div>
          ) : (
            <>
              {/* Tab 1: AI Knowledge */}
              {activeTab === "knowledge" && (
                <div>
                  {pr?.knowledge ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Summary */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Summary</div>
                        <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                          {pr.knowledge.summary || "No summary available."}
                        </div>
                      </div>

                      {/* Motivation */}
                      {pr.knowledge.motivation && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Motivation & Problem</div>
                          <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                            {pr.knowledge.motivation}
                          </div>
                        </div>
                      )}

                      {/* Components & Change Types */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: 4 }}>Components</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {pr.knowledge.components?.map((c: string) => (
                              <span key={c} className="badge badge-neutral">{c}</span>
                            )) || <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>None</span>}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: 4 }}>Change Type</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {pr.knowledge.change_types?.map((ct: string) => (
                              <span key={ct} className="badge badge-neutral">{ct}</span>
                            )) || <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>None</span>}
                          </div>
                        </div>
                      </div>

                      {/* Decisions */}
                      {pr.knowledge.key_decisions && pr.knowledge.key_decisions.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Key Decisions</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {pr.knowledge.key_decisions.map((dec: any, idx: number) => (
                              <div
                                key={idx}
                                style={{
                                  padding: 10,
                                  background: "var(--bg-subtle)",
                                  borderRadius: "var(--radius)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  fontSize: "0.82rem",
                                }}
                              >
                                <span>{dec.decision}</span>
                                <span className={`badge ${dec.evidence_type === "DOCUMENTED" ? "badge-success" : "badge-warning"}`}>
                                  {dec.evidence_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <p>AI understanding has not been generated for this PR yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Changed Files & Diffs */}
              {activeTab === "files" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
                      Click on any file to inspect code changes & diffs:
                    </span>
                    {pr?.changed_files && pr.changed_files.length > 0 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                        onClick={expandAllFiles}
                      >
                        {expandedFiles.size === pr.changed_files.length ? "Collapse All Diffs" : "Expand All Diffs"}
                      </button>
                    )}
                  </div>

                  {pr?.changed_files?.map((f: ChangedFile, idx: number) => {
                    const isExpanded = expandedFiles.has(f.filename);
                    return (
                      <div
                        key={idx}
                        style={{
                          background: "var(--bg-subtle)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "10px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                          onClick={() => toggleFile(f.filename)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                              {isExpanded ? "▼" : "▶"}
                            </span>
                            <span className="font-mono" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                              {f.filename}
                            </span>
                            <span className="badge badge-neutral" style={{ fontSize: "0.68rem" }}>
                              {f.status}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 8, fontSize: "0.8rem" }}>
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>+{f.additions}</span>
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>-{f.deletions}</span>
                          </div>
                        </div>

                        {/* Expandable Code Diff */}
                        {isExpanded && (
                          <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                            <CodeDiffView patch={f.patch} filename={f.filename} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: Commits & On-Demand Inspection */}
              {activeTab === "commits" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-tertiary)", marginBottom: 4 }}>
                    Click <strong>&quot;Inspect Commit Diff&quot;</strong> to fetch that commit&apos;s code changes live from GitHub on-demand:
                  </div>

                  {pr?.commits?.map((c: CommitInfo, idx: number) => {
                    const isExpanded = expandedCommitShas.has(c.sha);
                    const isLoadingThis = loadingCommitSha === c.sha;
                    const diffData = commitDiffs[c.sha];

                    return (
                      <div
                        key={idx}
                        style={{
                          background: "var(--bg-subtle)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "12px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ fontWeight: 500, fontSize: "0.88rem" }}>{c.message?.split("\n")[0]}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                              {c.author_name} {c.committed_at ? `· ${new Date(c.committed_at).toLocaleString()}` : ""}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="badge badge-neutral font-mono">{c.sha?.substring(0, 7)}</span>
                            <button
                              className={`btn btn-sm ${isExpanded ? "btn-secondary" : "btn-primary"}`}
                              style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                              onClick={() => handleInspectCommit(c.sha)}
                              disabled={isLoadingThis}
                            >
                              {isLoadingThis ? "Fetching Diff..." : isExpanded ? "▲ Hide Diff" : "🔍 Inspect Commit Diff"}
                            </button>
                          </div>
                        </div>

                        {/* On-Demand Expanded Commit Diff Content */}
                        {isExpanded && diffData && (
                          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 12, background: "var(--bg-surface)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                                Files Modified in Commit ({diffData.files.length}):
                              </span>
                              {diffData.stats && (
                                <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)" }}>
                                  <strong style={{ color: "#16a34a" }}>+{diffData.stats.additions}</strong> /{" "}
                                  <strong style={{ color: "#dc2626" }}>-{diffData.stats.deletions}</strong> lines
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {diffData.files.map((file, fIdx) => (
                                <div key={fIdx} style={{ borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                                  <CodeDiffView patch={file.patch} filename={file.filename} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
