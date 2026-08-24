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
  const [activeTab, setActiveTab] = useState<"knowledge" | "files" | "commits">("knowledge");

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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="font-mono" style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
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
                  style={{ fontSize: "0.78rem", marginLeft: 4 }}
                >
                  GitHub ↗
                </a>
              )}
            </div>
            <h3 style={{ fontSize: "1.1rem" }}>{pr?.title || "Loading..."}</h3>
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
              Structured Knowledge
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
              Changed Files ({pr?.changed_files?.length || 0})
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
              Commits ({pr?.commits?.length || 0})
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" />
              <p style={{ marginTop: 8 }}>Loading PR details...</p>
            </div>
          ) : (
            <>
              {/* Tab 1: Knowledge */}
              {activeTab === "knowledge" && (
                <div>
                  {pr?.knowledge ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Summary */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Summary</div>
                        <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius)", fontSize: "0.85rem" }}>
                          {pr.knowledge.summary || "No summary available."}
                        </div>
                      </div>

                      {/* Motivation */}
                      {pr.knowledge.motivation && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Motivation & Problem</div>
                          <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius)", fontSize: "0.85rem" }}>
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

              {/* Tab 2: Files */}
              {activeTab === "files" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pr?.changed_files?.map((f: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg-subtle)",
                        borderRadius: "var(--radius)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                      }}
                    >
                      <span className="font-mono">{f.filename}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ color: "#16a34a" }}>+{f.additions}</span>
                        <span style={{ color: "#dc2626" }}>-{f.deletions}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Commits */}
              {activeTab === "commits" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pr?.commits?.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg-subtle)",
                        borderRadius: "var(--radius)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div>
                        <div>{c.message?.split("\n")[0]}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                          {c.author_name}
                        </div>
                      </div>
                      <span className="badge badge-neutral font-mono">{c.sha?.substring(0, 7)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
