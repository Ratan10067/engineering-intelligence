"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  type Repository,
  type QuestionResponse,
  type EvidenceItem,
} from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";

function QuestionsContent() {
  const searchParams = useSearchParams();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<QuestionResponse | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [activePRId, setActivePRId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<
    { question: string; response: QuestionResponse; timestamp: Date }[]
  >([]);

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);

    // If query param is present, auto-fill and run
    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      setQuestion(initialQuery);
      executeAsk(initialQuery);
    }
  }, [searchParams]);

  async function executeAsk(qText: string) {
    if (!qText.trim() || loading) return;
    setLoading(true);
    try {
      const res = await api.askQuestion({
        question: qText.trim(),
        repo_id: selectedRepo,
        top_k: 5,
      });
      setResponse(res);
      setHistory((prev) => [
        { question: qText.trim(), response: res, timestamp: new Date() },
        ...prev,
      ]);
    } catch (e: any) {
      alert(`Error executing RAG query: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleAsk() {
    executeAsk(question);
  }

  function handleCopy() {
    if (!response) return;
    let textToCopy = `### Question: ${response.metadata?.question || question}\n\n${response.answer}\n\n### Evidence Citations:\n`;
    response.evidence.forEach((ev) => {
      textToCopy += `- **PR #${ev.pr_number}**: ${ev.title} (Relevance: ${(ev.relevance_score * 100).toFixed(0)}%)\n`;
    });
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const examplePrompts = [
    { label: "🚀 Release 5.2 vs 5.3", query: "What changed between release 5.2 and 5.3?" },
    { label: "🐛 Memory Leaks", query: "Have we seen image caching memory problems before?" },
    { label: "⚡ Performance Impact", query: "Which PRs affected memory usage or rendering latency?" },
    { label: "🏛️ Architectural Changes", query: "Why was the caching architecture rewritten?" },
    { label: "📦 Component Ownership", query: "Which PRs modified the authentication or database connection pool?" },
  ];

  return (
    <div className="animate-fade-in">
      <Header
        title="💬 Evidence-Backed Engineering Q&A"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      {/* Query Bar */}
      <div className="question-section" style={{ marginBottom: 32 }}>
        <h2 className="question-title">Ask Engineering Memory</h2>
        <p className="question-subtitle">
          Answers strictly grounded in original PRs, commits, reviews, and code changes.
        </p>

        <div className="search-bar-wrap">
          <div className="search-bar-inner">
            <span className="search-bar-icon">💡</span>
            <input
              className="input"
              placeholder="Ask how, why, or when engineering changes occurred..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            />
            <div className="search-bar-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAsk}
                disabled={loading || !question.trim()}
              >
                {loading ? <span className="loading-spinner" /> : "⚡ Generate Answer"}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Prompts */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {examplePrompts.map((p, idx) => (
            <button
              key={idx}
              className="tag"
              onClick={() => {
                setQuestion(p.query);
                executeAsk(p.query);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="empty-state">
          <div className="loading-dots" style={{ fontSize: "1.5rem" }}>
            <span /><span /><span />
          </div>
          <p style={{ marginTop: 18, color: "var(--text-primary)", fontWeight: 600, fontSize: "1rem" }}>
            Retrieving Evidence & Synthesizing Answer...
          </p>
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.82rem", maxWidth: 450, margin: "8px auto 0" }}>
            Hybrid retriever searching pgvector + PostgreSQL full-text search. Running inference via local Ollama LLM.
          </p>
        </div>
      )}

      {/* Response Panel */}
      {response && !loading && (
        <div className="answer-container animate-fade-in" style={{ marginBottom: 40 }}>
          {/* Main Answer Card */}
          <div className="answer-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1.2rem" }}>🤖</span>
                <h3 style={{ fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  Evidence-Backed Answer
                </h3>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                  {copied ? "✓ Copied!" : "📋 Copy Markdown"}
                </button>
                {!response.has_sufficient_evidence && (
                  <span className="badge badge-unknown">⚠️ Insufficient Evidence</span>
                )}
              </div>
            </div>

            {/* Answer Text */}
            <div className="answer-text" style={{ fontSize: "0.98rem" }}>
              {response.answer}
            </div>

            {/* Telemetry Bar */}
            <div className="telemetry-bar">
              <div className="telemetry-item">
                <span>Retrieval:</span>
                <strong>{response.latency.retrieval_ms?.toFixed(0)}ms</strong>
              </div>
              <div className="telemetry-item">
                <span>Context:</span>
                <strong>{response.latency.context_ms?.toFixed(0)}ms</strong>
              </div>
              <div className="telemetry-item">
                <span>LLM Inference:</span>
                <strong>{response.latency.llm_ms?.toFixed(0)}ms</strong>
              </div>
              <div className="telemetry-item" style={{ marginLeft: "auto" }}>
                <span>Total Latency:</span>
                <strong style={{ color: "var(--accent-indigo)" }}>
                  {response.latency.total_ms?.toFixed(0)}ms
                </strong>
              </div>
            </div>
          </div>

          {/* Evidence Sidebar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              >
                📎 Cited Evidence ({response.evidence.length})
              </h3>
              <span className="badge badge-documented">Strict Grounding</span>
            </div>

            <div className="evidence-panel">
              {response.evidence.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px 16px" }}>
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-desc">No indexed documents directly matched this query.</div>
                </div>
              ) : (
                response.evidence.map((ev, idx) => (
                  <div
                    key={idx}
                    className="evidence-item"
                    onClick={() => {
                      if (ev.pr_number) {
                        // Find PR id or trigger inspector
                        api.getPullRequests(selectedRepo || 1, 100, 0).then((res) => {
                          const match = res.items.find((p) => p.pr_number === ev.pr_number);
                          if (match) setActivePRId(match.id);
                        });
                      }
                    }}
                  >
                    <div className="evidence-header">
                      <span className="evidence-pr" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        PR #{ev.pr_number}
                        {ev.html_url && (
                          <a
                            href={ev.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.75rem", color: "var(--accent-indigo)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            ↗
                          </a>
                        )}
                      </span>
                      <span className="evidence-score" style={{ fontFamily: "JetBrains Mono" }}>
                        {(ev.relevance_score * 100).toFixed(0)}% Match
                      </span>
                    </div>

                    <div className="evidence-title">{ev.title}</div>

                    <div className="evidence-meta">
                      {ev.author && <span>👤 {ev.author}</span>}
                      {ev.date && <span>📅 {new Date(ev.date).toLocaleDateString()}</span>}
                      {ev.document_type && (
                        <span className="badge badge-indigo" style={{ fontSize: "0.62rem" }}>
                          {ev.document_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Evidence Classification Footnote */}
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "var(--bg-glass)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.75rem",
                color: "var(--text-tertiary)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "var(--text-secondary)" }}>Evidence Protocol:</strong> Facts are marked <code>DOCUMENTED</code> from discussions. Deducible impacts are labeled <code>INFERRED</code>. Unsupported claims trigger <code>UNKNOWN</code> warnings.
            </div>
          </div>
        </div>
      )}

      {/* Query History */}
      {history.length > 1 && (
        <div style={{ marginTop: 48 }}>
          <div className="card-header">
            <h3 className="card-title">📜 Query History</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
              {history.length} questions in this session
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.slice(1).map((h, idx) => (
              <div
                key={idx}
                className="result-card"
                onClick={() => {
                  setQuestion(h.question);
                  setResponse(h.response);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                    {h.question}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    {h.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="result-content" style={{ WebkitLineClamp: 2 }}>
                  {h.response.answer}
                </div>
                <div className="result-tags" style={{ marginTop: 10 }}>
                  <span className="tag">📎 {h.response.evidence.length} Evidence Docs</span>
                  <span className="tag">⏱️ {h.response.latency.total_ms?.toFixed(0)}ms</span>
                  <span className="tag" style={{ color: "var(--accent-indigo)" }}>Click to Load ↗</span>
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

export default function QuestionsPage() {
  return (
    <Suspense fallback={<div className="empty-state"><div className="loading-spinner" /></div>}>
      <QuestionsContent />
    </Suspense>
  );
}
