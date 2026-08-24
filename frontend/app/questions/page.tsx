"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  type Repository,
  type QuestionResponse,
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
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!response) return;
    navigator.clipboard.writeText(response.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const exampleQuestions = [
    "What changed between the last two releases?",
    "Have we seen memory leaks or caching problems before?",
    "Which PRs affected backend performance or latency?",
    "Why was the architecture changed recently?",
  ];

  return (
    <div>
      <Header
        title="Evidence-Backed Q&A"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      {/* Question Input Card */}
      <div className="card">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            placeholder="Ask a question about engineering history (e.g., Why was the caching logic changed?)..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeAsk(question)}
          />
          <button
            className="btn btn-primary"
            onClick={() => executeAsk(question)}
            disabled={loading || !question.trim()}
          >
            {loading ? "Generating..." : "Ask AI"}
          </button>
        </div>

        {/* Quick Example Questions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Examples:</span>
          {exampleQuestions.map((eq, idx) => (
            <button
              key={idx}
              className="tag"
              onClick={() => {
                setQuestion(eq);
                executeAsk(eq);
              }}
            >
              {eq}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p style={{ marginTop: 10, fontWeight: 500 }}>
            Retrieving engineering evidence and generating answer...
          </p>
        </div>
      )}

      {/* Answer & Evidence Layout */}
      {response && !loading && (
        <div className="qa-layout">
          {/* Answer Box */}
          <div className="answer-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Answer</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy Text"}
                </button>
                {!response.has_sufficient_evidence && (
                  <span className="badge badge-warning">Limited Evidence</span>
                )}
              </div>
            </div>

            <div className="answer-text">{response.answer}</div>

            {/* Latency Footer */}
            <div
              style={{
                marginTop: 20,
                paddingTop: 12,
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                gap: 16,
                fontSize: "0.75rem",
                color: "var(--text-tertiary)",
              }}
            >
              <span>Retrieval: <strong>{response.latency.retrieval_ms?.toFixed(0)}ms</strong></span>
              <span>Context: <strong>{response.latency.context_ms?.toFixed(0)}ms</strong></span>
              <span>LLM: <strong>{response.latency.llm_ms?.toFixed(0)}ms</strong></span>
              <span>Total: <strong>{response.latency.total_ms?.toFixed(0)}ms</strong></span>
            </div>
          </div>

          {/* Evidence List */}
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 10 }}>
              Retrieved Evidence ({response.evidence.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {response.evidence.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px" }}>
                  No evidence documents retrieved.
                </div>
              ) : (
                response.evidence.map((ev, idx) => (
                  <div
                    key={idx}
                    className="card"
                    style={{ padding: 12, marginBottom: 0, cursor: "pointer" }}
                    onClick={() => {
                      if (ev.pr_number) {
                        api.getPullRequests(selectedRepo || 1, 100, 0).then((res) => {
                          const match = res.items.find((p) => p.pr_number === ev.pr_number);
                          if (match) setActivePRId(match.id);
                        });
                      }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="font-mono" style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "0.82rem" }}>
                        PR #{ev.pr_number}
                      </span>
                      <span className="badge badge-success font-mono" style={{ fontSize: "0.68rem" }}>
                        {(ev.relevance_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 500, marginBottom: 4 }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
                      {ev.author && `${ev.author} · `}
                      {ev.date && new Date(ev.date).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 10, color: "var(--text-secondary)" }}>
            Previous Questions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.slice(1).map((h, idx) => (
              <div
                key={idx}
                className="card"
                style={{ padding: 12, marginBottom: 0, cursor: "pointer" }}
                onClick={() => {
                  setQuestion(h.question);
                  setResponse(h.response);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 500, fontSize: "0.85rem" }}>{h.question}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
                    {h.timestamp.toLocaleTimeString()}
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

export default function QuestionsPage() {
  return (
    <Suspense fallback={<div className="empty-state"><div className="loading-spinner" /></div>}>
      <QuestionsContent />
    </Suspense>
  );
}
