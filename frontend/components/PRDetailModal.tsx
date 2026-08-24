"use client";

import { useEffect, useState } from "react";
import { api, type PullRequest } from "@/lib/api";

interface PRDetailModalProps {
  prId: number | null;
  onClose: () => void;
}

export function PRDetailModal({ prId, onClose }: PRDetailModalProps) {
  const [pr, setPr] = useState<PullRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"knowledge" | "files" | "commits" | "reviews">("knowledge");

  useEffect(() => {
    if (!prId) return;
    setLoading(true);
    api.getPullRequest(prId)
      .then(setPr)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [prId]);

  if (!prId) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span className="pr-number-pill" style={{ fontSize: "1.1rem" }}>
                PR #{pr?.pr_number}
              </span>
              <span className={`badge ${pr?.is_merged ? "badge-documented" : "badge-indigo"}`}>
                {pr?.is_merged ? "✓ Merged" : pr?.state}
              </span>
              {pr?.milestone && <span className="tag">🏷️ {pr.milestone}</span>}
              {pr?.html_url && (
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tag"
                  style={{ color: "var(--accent-indigo)" }}
                >
                  🔗 View on GitHub ↗
                </a>
              )}
            </div>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>
              {pr?.title || "Loading Pull Request..."}
            </h3>
            <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
              <span>👤 Author: <strong>{pr?.author}</strong></span>
              <span>📅 Merged: {pr?.merged_at ? new Date(pr.merged_at).toLocaleDateString() : "N/A"}</span>
              <span>📊 Changes: <strong style={{ color: "#4ade80" }}>+{pr?.additions}</strong> / <strong style={{ color: "#f87171" }}>-{pr?.deletions}</strong> ({pr?.changed_files_count} files)</span>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: "50%", width: 36, height: 36, padding: 0 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div style={{ padding: "0 28px", background: "rgba(15, 22, 41, 0.95)" }}>
          <div className="tabs-header" style={{ marginBottom: 0 }}>
            <button
              className={`tab-btn ${activeTab === "knowledge" ? "active" : ""}`}
              onClick={() => setActiveTab("knowledge")}
            >
              🧠 AI Understanding
            </button>
            <button
              className={`tab-btn ${activeTab === "files" ? "active" : ""}`}
              onClick={() => setActiveTab("files")}
            >
              📄 Changed Files ({pr?.changed_files?.length || 0})
            </button>
            <button
              className={`tab-btn ${activeTab === "commits" ? "active" : ""}`}
              onClick={() => setActiveTab("commits")}
            >
              📝 Commits ({pr?.commits?.length || 0})
            </button>
            <button
              className={`tab-btn ${activeTab === "reviews" ? "active" : ""}`}
              onClick={() => setActiveTab("reviews")}
            >
              💬 Reviews ({pr?.reviews?.length || 0})
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" style={{ width: 36, height: 36 }} />
              <p style={{ marginTop: 12, color: "var(--text-tertiary)" }}>Loading PR details & memory...</p>
            </div>
          ) : (
            <>
              {/* Tab 1: AI Structured Knowledge */}
              {activeTab === "knowledge" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {pr?.knowledge ? (
                    <>
                      {/* Summary */}
                      <div className="card" style={{ padding: 20, background: "rgba(22, 32, 56, 0.6)" }}>
                        <div className="card-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>
                          📌 Engineering Summary
                        </div>
                        <p style={{ color: "var(--text-primary)", fontSize: "0.92rem", lineHeight: 1.7 }}>
                          {pr.knowledge.summary || "No summary available."}
                        </p>
                      </div>

                      {/* Motivation */}
                      {pr.knowledge.motivation && (
                        <div className="card" style={{ padding: 20, background: "rgba(22, 32, 56, 0.6)" }}>
                          <div className="card-title" style={{ fontSize: "0.95rem", marginBottom: 8 }}>
                            🎯 Engineering Motivation & Problem Solved
                          </div>
                          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.7 }}>
                            {pr.knowledge.motivation}
                          </p>
                        </div>
                      )}

                      {/* Classification Grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                        {/* Components */}
                        <div className="card" style={{ padding: 18, background: "rgba(22, 32, 56, 0.5)" }}>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                            Affected Components
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {pr.knowledge.components?.map((c: string) => (
                              <span key={c} className="badge badge-cyan">{c}</span>
                            )) || <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>None documented</span>}
                          </div>
                        </div>

                        {/* Change Types */}
                        <div className="card" style={{ padding: 18, background: "rgba(22, 32, 56, 0.5)" }}>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                            Change Classifications
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {pr.knowledge.change_types?.map((ct: string) => (
                              <span key={ct} className="badge badge-violet">{ct}</span>
                            )) || <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>None</span>}
                          </div>
                        </div>

                        {/* Architectural Change */}
                        <div className="card" style={{ padding: 18, background: "rgba(22, 32, 56, 0.5)" }}>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                            Architectural Change
                          </div>
                          <div>
                            {pr.knowledge.architectural_change ? (
                              <span className="badge badge-unknown">⚠️ Architectural Rewrite</span>
                            ) : (
                              <span className="badge badge-documented">Standard Evolution</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Key Decisions */}
                      {pr.knowledge.key_decisions && pr.knowledge.key_decisions.length > 0 && (
                        <div className="card" style={{ padding: 20 }}>
                          <div className="card-title" style={{ fontSize: "0.95rem", marginBottom: 12 }}>
                            🏛️ Key Architectural & Implementation Decisions
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {pr.knowledge.key_decisions.map((dec: any, idx: number) => (
                              <div
                                key={idx}
                                style={{
                                  padding: "12px 14px",
                                  background: "var(--bg-glass)",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--border-subtle)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                    {dec.decision}
                                  </span>
                                  <span
                                    className={`badge ${
                                      dec.evidence_type === "DOCUMENTED"
                                        ? "badge-documented"
                                        : dec.evidence_type === "INFERRED"
                                        ? "badge-inferred"
                                        : "badge-unknown"
                                    }`}
                                  >
                                    {dec.evidence_type}
                                  </span>
                                </div>
                                {dec.evidence_source && (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                                    Source: {dec.evidence_source}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state" style={{ padding: "30px 16px" }}>
                      <div className="empty-state-icon">🤖</div>
                      <div className="empty-state-title">AI analysis pending</div>
                      <div className="empty-state-desc">
                        This PR has been collected from GitHub and is queued for LLM knowledge extraction.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Changed Files */}
              {activeTab === "files" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {pr?.changed_files?.map((f: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "14px 18px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.88rem", color: "var(--text-primary)" }}>
                          📄 {f.filename}
                        </span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="tag" style={{ textTransform: "capitalize" }}>{f.status}</span>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: "#4ade80" }}>+{f.additions}</span>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: "#f87171" }}>-{f.deletions}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Commits */}
              {activeTab === "commits" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pr?.commits?.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                          {c.message?.split("\n")[0]}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 4 }}>
                          {c.author_name} {c.committed_at && `· ${new Date(c.committed_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <span className="badge badge-indigo">{c.sha?.substring(0, 7)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 4: Reviews */}
              {activeTab === "reviews" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {pr?.reviews?.length ? (
                    pr.reviews.map((r: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-md)",
                          padding: "16px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            👤 {r.author}
                          </span>
                          <span className={`badge ${r.state === "APPROVED" ? "badge-documented" : "badge-inferred"}`}>
                            {r.state}
                          </span>
                        </div>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", whiteSpace: "pre-wrap" }}>
                          {r.body || "Approved without comment text."}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state" style={{ padding: "20px" }}>
                      <div className="empty-state-desc">No review comments recorded for this PR.</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
