"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  api,
  type Repository,
  type QuestionResponse,
  type EvidenceItem,
} from "@/lib/api";
import { Header } from "@/components/Header";
import { PRDetailModal } from "@/components/PRDetailModal";

const STORAGE_KEYS = {
  question: "ei_qa_question",
  response: "ei_qa_response",
  history: "ei_qa_history",
  selectedRepo: "ei_qa_selected_repo",
};

function QuestionsContent() {
  const searchParams = useSearchParams();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<QuestionResponse | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingEvidence, setStreamingEvidence] = useState<EvidenceItem[]>([]);
  const [activePRId, setActivePRId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<
    { question: string; response: QuestionResponse; timestamp: string }[]
  >([]);

  const isInitialMount = useRef(true);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedQ = sessionStorage.getItem(STORAGE_KEYS.question);
      const savedResp = sessionStorage.getItem(STORAGE_KEYS.response);
      const savedHist = sessionStorage.getItem(STORAGE_KEYS.history);
      const savedRepo = sessionStorage.getItem(STORAGE_KEYS.selectedRepo);

      if (savedQ) setQuestion(savedQ);
      if (savedResp) setResponse(JSON.parse(savedResp));
      if (savedHist) setHistory(JSON.parse(savedHist));
      if (savedRepo) setSelectedRepo(Number(savedRepo));
    } catch {
      // ignore storage errors
    }

    api.getRepositories().then(setRepos).catch(console.error);

    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      setQuestion(initialQuery);
      executeAsk(initialQuery);
    }
  }, [searchParams]);

  // Persist state to sessionStorage on change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEYS.question, question);
      if (response) {
        sessionStorage.setItem(STORAGE_KEYS.response, JSON.stringify(response));
      }
      if (history.length > 0) {
        sessionStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
      }
      if (selectedRepo !== undefined) {
        sessionStorage.setItem(STORAGE_KEYS.selectedRepo, String(selectedRepo));
      }
    } catch {
      // ignore storage errors
    }
  }, [question, response, history, selectedRepo]);

  async function executeAsk(qText: string) {
    if (!qText.trim() || loading || isStreaming) return;

    setLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    setStreamingEvidence([]);
    setResponse(null);

    let accumulatedText = "";
    let retrievedEvidence: EvidenceItem[] = [];

    try {
      await api.askQuestionStream(
        {
          question: qText.trim(),
          repo_id: selectedRepo,
          top_k: 5,
        },
        {
          onEvidence: (evidence) => {
            retrievedEvidence = evidence;
            setStreamingEvidence(evidence);
            setLoading(false); // Retrieval done, now generating answer
          },
          onToken: (token) => {
            accumulatedText += token;
            setStreamingText((prev) => prev + token);
          },
          onDone: (finalResp) => {
            setResponse(finalResp);
            setIsStreaming(false);
            setHistory((prev) => [
              {
                question: qText.trim(),
                response: finalResp,
                timestamp: new Date().toISOString(),
              },
              ...prev,
            ]);
          },
          onError: (err) => {
            alert(`Error: ${err.message}`);
            setIsStreaming(false);
            setLoading(false);
          },
        }
      );
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }

  function handleCopy() {
    const textToCopy = response?.answer || streamingText;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const exampleQuestions = [
    "What changed between the last two releases?",
    "Have we seen memory leaks or caching problems before?",
    "Which PRs affected backend performance or latency?",
    "Why was the architecture changed recently?",
  ];

  const displayAnswer = response ? response.answer : streamingText;
  const displayEvidence = response ? response.evidence : streamingEvidence;

  return (
    <div>
      <Header
        title="Evidence-Backed Q&A"
        selectedRepoId={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />

      {/* Question Input Card */}
      <div className="card">
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <select
            className="filter-select"
            value={selectedRepo || ""}
            onChange={(e) => setSelectedRepo(e.target.value ? Number(e.target.value) : undefined)}
            style={{ minWidth: 200 }}
          >
            <option value="">🏢 All Repositories</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                📁 {r.full_name}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: 1, minWidth: 280 }}
            placeholder="Ask a question about engineering history (e.g., Why was the caching logic changed?)..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeAsk(question)}
          />
          <button
            className="btn btn-primary"
            onClick={() => executeAsk(question)}
            disabled={loading || isStreaming || !question.trim()}
          >
            {loading ? "Searching..." : isStreaming ? "Streaming..." : "Ask AI"}
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

      {/* Loading State (Retrieval) */}
      {loading && !isStreaming && (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p style={{ marginTop: 10, fontWeight: 500 }}>
            Searching engineering documents and PR history...
          </p>
        </div>
      )}

      {/* Answer & Evidence Layout */}
      {(displayAnswer || (isStreaming && displayEvidence.length > 0) || response) && (
        <div className="qa-layout">
          {/* Answer Box */}
          <div className="answer-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Answer</h3>
                {isStreaming && (
                  <span className="badge badge-warning" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span className="sync-status-dot pulsing" style={{ width: 6, height: 6 }} />
                    Streaming live...
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {displayAnswer && (
                  <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy Text"}
                  </button>
                )}
                {response && !response.has_sufficient_evidence && (
                  <span className="badge badge-warning">Limited Evidence</span>
                )}
              </div>
            </div>

            <div className="answer-text markdown-content">
              {displayAnswer ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {displayAnswer}
                </ReactMarkdown>
              ) : isStreaming ? (
                <div style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                  Generating answer from retrieved evidence...
                </div>
              ) : null}
            </div>

            {/* Latency Footer */}
            {response && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  gap: 16,
                  fontSize: "0.75rem",
                  color: "var(--text-tertiary)",
                  flexWrap: "wrap",
                }}
              >
                <span>Retrieval: <strong>{response.latency.retrieval_ms?.toFixed(0)}ms</strong></span>
                <span>Context: <strong>{response.latency.context_ms?.toFixed(0)}ms</strong></span>
                <span>LLM: <strong>{response.latency.llm_ms?.toFixed(0)}ms</strong></span>
                <span>Total: <strong>{response.latency.total_ms?.toFixed(0)}ms</strong></span>
              </div>
            )}
          </div>

          {/* Evidence List */}
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 10 }}>
              Retrieved Evidence ({displayEvidence.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayEvidence.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px" }}>
                  No evidence documents retrieved.
                </div>
              ) : (
                displayEvidence.map((ev, idx) => (
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
            Previous Questions ({history.length})
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
                    {new Date(h.timestamp).toLocaleTimeString()}
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
