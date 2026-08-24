"use client";

import { useState, useEffect } from "react";
import {
  api,
  type Repository,
  type QuestionResponse,
  type EvidenceItem,
} from "@/lib/api";

export default function QuestionsPage() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<QuestionResponse | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    { question: string; response: QuestionResponse }[]
  >([]);

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  async function handleAsk() {
    if (!question.trim() || loading) return;
    setLoading(true);
    try {
      const res = await api.askQuestion({
        question: question.trim(),
        repo_id: selectedRepo,
        top_k: 5,
      });
      setResponse(res);
      setHistory((prev) => [
        { question: question.trim(), response: res },
        ...prev,
      ]);
      setQuestion("");
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const exampleQuestions = [
    "What changed between the last two releases?",
    "Have we seen performance issues before?",
    "Which PRs affected memory usage?",
    "Why was the architecture changed recently?",
    "Which components were most frequently modified?",
  ];

  return (
    <div className="animate-fade-in">
      <div className="header">
        <div className="header-title">💬 Ask Engineering Questions</div>
        {repos.length > 0 && (
          <select
            className="filter-select"
            value={selectedRepo || ""}
            onChange={(e) =>
              setSelectedRepo(
                e.target.value ? Number(e.target.value) : undefined
              )
            }
          >
            <option value="">All Repositories</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Question Input */}
      <div className="question-section">
        <h2 className="question-title">Ask Your Engineering Memory</h2>
        <p className="question-subtitle">
          Get evidence-backed answers from your GitHub history
        </p>
        <div className="search-bar">
          <span className="search-icon">💡</span>
          <input
            className="input"
            placeholder="Ask about PRs, changes, decisions, issues..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <button
            className="btn btn-primary"
            onClick={handleAsk}
            disabled={loading || !question.trim()}
          >
            {loading ? <span className="loading-spinner" /> : "Ask"}
          </button>
        </div>

        {/* Example Questions */}
        {!response && !loading && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 16,
            }}
          >
            {exampleQuestions.map((q) => (
              <button
                key={q}
                className="tag"
                style={{ cursor: "pointer", fontSize: "0.78rem" }}
                onClick={() => setQuestion(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="empty-state">
          <div className="loading-dots" style={{ fontSize: "1.5rem" }}>
            <span /><span /><span />
          </div>
          <p
            style={{
              marginTop: 16,
              color: "var(--text-tertiary)",
              fontSize: "0.9rem",
            }}
          >
            Searching engineering history and generating answer...
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
            This may take a moment with local LLM
          </p>
        </div>
      )}

      {/* Response */}
      {response && !loading && (
        <div className="answer-container animate-fade-in">
          {/* Answer Panel */}
          <div className="answer-panel">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>
                🤖 Answer
              </h3>
              {!response.has_sufficient_evidence && (
                <span className="badge badge-amber">⚠️ Limited Evidence</span>
              )}
            </div>
            <div className="answer-text">{response.answer}</div>

            {/* Latency */}
            <div className="latency-bar">
              <div className="latency-item">
                Retrieval:{" "}
                <span>{response.latency.retrieval_ms?.toFixed(0)}ms</span>
              </div>
              <div className="latency-item">
                Context:{" "}
                <span>{response.latency.context_ms?.toFixed(0)}ms</span>
              </div>
              <div className="latency-item">
                LLM: <span>{response.latency.llm_ms?.toFixed(0)}ms</span>
              </div>
              <div className="latency-item">
                Total:{" "}
                <span style={{ color: "var(--accent-indigo)" }}>
                  {response.latency.total_ms?.toFixed(0)}ms
                </span>
              </div>
            </div>
          </div>

          {/* Evidence Panel */}
          <div>
            <h3
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 12,
                fontWeight: 600,
              }}
            >
              📎 Evidence ({response.evidence.length})
            </h3>
            <div className="evidence-panel">
              {response.evidence.length === 0 ? (
                <div
                  className="empty-state"
                  style={{ padding: "30px 16px" }}
                >
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-desc">
                    No evidence documents found
                  </div>
                </div>
              ) : (
                response.evidence.map((ev, idx) => (
                  <EvidenceCard key={idx} evidence={ev} />
                ))
              )}
            </div>

            {/* Evidence Tracking */}
            {response.evidence_tracking?.cited_prs?.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "var(--bg-glass)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.75rem",
                  color: "var(--text-tertiary)",
                }}
              >
                <strong>Cited PRs:</strong>{" "}
                {response.evidence_tracking.cited_prs
                  .map((n: number) => `#${n}`)
                  .join(", ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div style={{ marginTop: 40 }}>
          <h3
            style={{
              fontSize: "0.85rem",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 12,
            }}
          >
            Previous Questions
          </h3>
          {history.slice(1).map((h, idx) => (
            <div
              key={idx}
              className="result-card"
              style={{ marginBottom: 8, cursor: "pointer" }}
              onClick={() => setResponse(h.response)}
            >
              <div className="result-title">{h.question}</div>
              <div
                className="result-content"
                style={{ WebkitLineClamp: 2 }}
              >
                {h.response.answer}
              </div>
              <div className="result-tags">
                <span className="tag">
                  📎 {h.response.evidence.length} evidence
                </span>
                <span className="tag">
                  ⏱️ {h.response.latency.total_ms?.toFixed(0)}ms
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: EvidenceItem }) {
  return (
    <div className="evidence-item">
      <div className="evidence-header">
        <span className="evidence-pr">
          {evidence.html_url ? (
            <a
              href={evidence.html_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit" }}
            >
              PR #{evidence.pr_number} ↗
            </a>
          ) : (
            `PR #${evidence.pr_number}`
          )}
        </span>
        <span className="evidence-score">
          {(evidence.relevance_score * 100).toFixed(1)}%
        </span>
      </div>
      <div className="evidence-title">{evidence.title}</div>
      <div className="evidence-meta">
        {evidence.author && <span>👤 {evidence.author}</span>}
        {evidence.date && (
          <span>📅 {new Date(evidence.date).toLocaleDateString()}</span>
        )}
        {evidence.release && <span>🏷️ {evidence.release}</span>}
        {evidence.document_type && (
          <span className="badge badge-indigo" style={{ fontSize: "0.65rem" }}>
            {evidence.document_type.replace(/_/g, " ")}
          </span>
        )}
        {evidence.components?.map((c) => (
          <span key={c} className="badge badge-cyan" style={{ fontSize: "0.65rem" }}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
