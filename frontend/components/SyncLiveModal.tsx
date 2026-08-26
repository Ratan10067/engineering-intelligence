"use client";

import { useEffect, useRef, useState } from "react";
import { useSync, PHASE_LABELS, PHASE_ORDER, type SyncEvent } from "@/context/SyncContext";

export function SyncLiveModal() {
  const {
    activeRepo,
    maxPrs,
    fromDate,
    toDate,
    isOpen,
    isMinimized,
    isSyncing,
    events,
    phase,
    isComplete,
    hasError,
    summary,
    minimize,
    restore,
    close,
    stop,
  } = useSync();

  const [expandedLLM, setExpandedLLM] = useState<Set<number>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current && isOpen && !isMinimized) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, isOpen, isMinimized]);

  const toggleLLM = (eventId: number) => {
    setExpandedLLM((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  if (!activeRepo || (!isOpen && !isMinimized)) return null;

  const repoName = activeRepo.full_name;

  // ── Render helpers ───────────────────────────────────────────────────

  function renderEvent(evt: SyncEvent) {
    const time = new Date(evt.timestamp).toLocaleTimeString();

    switch (evt.type) {
      case "system":
        return (
          <div key={evt.id} className="sync-event sync-event--system">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">⚙️</span>
            <span className="sync-msg">{evt.data.message}</span>
          </div>
        );

      case "phase":
        return (
          <div key={evt.id} className="sync-event sync-event--phase">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">
              {evt.data.phase === "collecting" ? "📡" :
               evt.data.phase === "understanding" ? "🧠" :
               evt.data.phase === "documenting" ? "📄" :
               evt.data.phase === "embedding" ? "📐" : "🔄"}
            </span>
            <span className="sync-msg sync-msg--phase">{evt.data.message}</span>
          </div>
        );

      case "fetch_summary":
        return (
          <div key={evt.id} className="sync-event sync-event--info">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">📊</span>
            <span className="sync-msg">{evt.data.message}</span>
          </div>
        );

      case "pr_fetched":
        return (
          <div key={evt.id} className="sync-event sync-event--pr">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">📥</span>
            <span className="sync-msg">
              <span className="sync-pr-num">PR #{evt.data.pr_number}</span>{" "}
              <span className="sync-pr-title">{evt.data.title}</span>
              <span className="sync-pr-meta">
                by {evt.data.author} · <span className="sync-add">+{evt.data.additions}</span>
                <span className="sync-del">-{evt.data.deletions}</span> · {evt.data.files_count} files
              </span>
            </span>
            <span className="sync-counter">{evt.data.index}/{evt.data.total}</span>
          </div>
        );

      case "llm_start":
        return (
          <div key={evt.id} className="sync-event sync-event--llm-start">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">⏳</span>
            <span className="sync-msg">
              Analyzing <span className="sync-pr-num">PR #{evt.data.pr_number}</span> with LLM...
            </span>
            <span className="sync-counter">{evt.data.index}/{evt.data.total}</span>
          </div>
        );

      case "pr_understood":
        return (
          <div key={evt.id} className="sync-event sync-event--llm-done">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">🧠</span>
            <div className="sync-llm-result">
              <div className="sync-msg">
                <span className="sync-pr-num">PR #{evt.data.pr_number}</span>{" "}
                <span className="sync-llm-summary">{evt.data.llm_summary}</span>
                <button
                  className="sync-expand-btn"
                  onClick={() => toggleLLM(evt.id)}
                >
                  {expandedLLM.has(evt.id) ? "▼ Hide JSON" : "▶ View LLM JSON"}
                </button>
              </div>
              {evt.data.llm_components?.length > 0 && (
                <div className="sync-tags">
                  {evt.data.llm_components.map((c: string, i: number) => (
                    <span key={i} className="sync-tag">{c}</span>
                  ))}
                  {evt.data.llm_change_types?.map((t: string, i: number) => (
                    <span key={`t-${i}`} className="sync-tag sync-tag--type">{t}</span>
                  ))}
                </div>
              )}
              {expandedLLM.has(evt.id) && (
                <pre className="sync-json">{JSON.stringify(evt.data.llm_response, null, 2)}</pre>
              )}
            </div>
            <span className="sync-counter">{evt.data.index}/{evt.data.total}</span>
          </div>
        );

      case "llm_failed":
        return (
          <div key={evt.id} className="sync-event sync-event--error">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">❌</span>
            <span className="sync-msg">
              PR #{evt.data.pr_number} LLM failed: {evt.data.message}
            </span>
          </div>
        );

      case "docs_created":
        return (
          <div key={evt.id} className="sync-event sync-event--info">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">📄</span>
            <span className="sync-msg">{evt.data.message}</span>
          </div>
        );

      case "embeddings_done":
        return (
          <div key={evt.id} className="sync-event sync-event--info">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">📐</span>
            <span className="sync-msg">{evt.data.message}</span>
          </div>
        );

      case "completed":
        return (
          <div key={evt.id} className="sync-event sync-event--complete">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">🎉</span>
            <span className="sync-msg sync-msg--phase">{evt.data.message}</span>
          </div>
        );

      case "error":
        return (
          <div key={evt.id} className="sync-event sync-event--error">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">🚨</span>
            <span className="sync-msg">{evt.data.message}</span>
          </div>
        );

      case "pr_error":
        return (
          <div key={evt.id} className="sync-event sync-event--error">
            <span className="sync-time">{time}</span>
            <span className="sync-icon">⚠️</span>
            <span className="sync-msg">PR storage error: {evt.data.error}</span>
          </div>
        );

      default:
        return null;
    }
  }

  // Progress calculation
  const prsFetched = events.filter((e) => e.type === "pr_fetched").length;
  const prsUnderstood = events.filter((e) => e.type === "pr_understood").length;
  const totalFetched = events.find((e) => e.type === "fetch_summary")?.data?.total_fetched ?? 0;

  const currentPhaseIdx = PHASE_ORDER.indexOf(phase);

  // ── Render Minimized Floating Widget ─────────────────────────────────
  if (isMinimized) {
    return (
      <div
        className="sync-minimized-widget"
        onClick={restore}
        title="Click to reopen full sync window"
      >
        <div className="sync-minimized-left">
          <div className={`sync-status-dot ${isComplete ? "done" : hasError ? "error" : "pulsing"}`} />
          <div className="sync-minimized-text">
            <div className="sync-minimized-repo">{repoName}</div>
            <div className="sync-minimized-status">
              {isComplete
                ? `✓ Completed (${summary?.total_prs ?? prsFetched} PRs)`
                : hasError
                ? "✕ Failed"
                : phase === "cancelled"
                ? "Cancelled"
                : `${PHASE_LABELS[phase] || "Syncing"} ${
                    phase === "understanding" && totalFetched > 0
                      ? `(${prsUnderstood}/${totalFetched})`
                      : phase === "collecting" && totalFetched > 0
                      ? `(${prsFetched}/${totalFetched})`
                      : ""
                  }`}
            </div>
          </div>
        </div>
        <div className="sync-minimized-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={restore}
            title="Expand to full screen"
          >
            ↗ Open
          </button>
          {!isComplete && !hasError && phase !== "cancelled" && (
            <button
              className="btn btn-sm"
              style={{ background: "#ef4444", color: "#fff", border: "none", padding: "2px 6px" }}
              onClick={stop}
              title="Stop sync"
            >
              ■
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: "2px 6px" }}
            onClick={close}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ── Render Full Modal ────────────────────────────────────────────────
  return (
    <div className="sync-modal-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sync-modal">
        {/* Header */}
        <div className="sync-modal-header">
          <div className="sync-modal-title">
            <span className="sync-modal-repo">{repoName}</span>
            <span className="sync-modal-subtitle">
              Live Sync Pipeline {fromDate || toDate ? `· ${fromDate || 'Start'} to ${toDate || 'Latest'}` : ''}
            </span>
          </div>
          <div className="sync-modal-actions">
            {!isComplete && !hasError && phase !== "cancelled" && (
              <button className="btn btn-sm" style={{ background: "#ef4444", color: "#fff", border: "none" }} onClick={stop}>
                ■ Stop
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={minimize}
              title="Minimize to floating widget"
            >
              − Minimize
            </button>
            <button className="btn btn-secondary btn-sm" onClick={close} title="Close window">
              ✕ Close
            </button>
          </div>
        </div>

        {/* Phase Pipeline Indicator */}
        <div className="sync-pipeline">
          {PHASE_ORDER.map((p, i) => {
            const isActive = p === phase;
            const isDone = currentPhaseIdx > i || isComplete;
            return (
              <div
                key={p}
                className={`sync-pipeline-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
              >
                <div className="sync-pipeline-dot">
                  {isDone ? "✓" : isActive ? (i + 1) : (i + 1)}
                </div>
                <span className="sync-pipeline-label">{PHASE_LABELS[p]}</span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        {phase === "collecting" && totalFetched > 0 && (
          <div className="sync-progress-wrap">
            <div className="sync-progress-bar">
              <div className="sync-progress-fill" style={{ width: `${(prsFetched / totalFetched) * 100}%` }} />
            </div>
            <span className="sync-progress-text">{prsFetched}/{totalFetched} PRs fetched</span>
          </div>
        )}
        {phase === "understanding" && totalFetched > 0 && (
          <div className="sync-progress-wrap">
            <div className="sync-progress-bar">
              <div className="sync-progress-fill sync-progress-fill--llm" style={{ width: `${(prsUnderstood / (totalFetched || 1)) * 100}%` }} />
            </div>
            <span className="sync-progress-text">{prsUnderstood}/{totalFetched} PRs analyzed</span>
          </div>
        )}

        {/* Live Event Feed */}
        <div className="sync-feed" ref={feedRef}>
          {events.map(renderEvent)}
          {!isComplete && !hasError && phase !== "cancelled" && (
            <div className="sync-event sync-event--loading">
              <span className="sync-spinner" />
              <span className="sync-msg">Processing...</span>
            </div>
          )}
        </div>

        {/* Summary Footer */}
        {isComplete && summary && (
          <div className="sync-summary">
            <div className="sync-summary-item">
              <span className="sync-summary-value">{summary.total_prs}</span>
              <span className="sync-summary-label">PRs Indexed</span>
            </div>
            <div className="sync-summary-item">
              <span className="sync-summary-value">{summary.total_understood}</span>
              <span className="sync-summary-label">LLM Analyzed</span>
            </div>
            <div className="sync-summary-item">
              <span className="sync-summary-value">{summary.total_docs}</span>
              <span className="sync-summary-label">Documents</span>
            </div>
            <div className="sync-summary-item">
              <span className="sync-summary-value">{summary.total_embeddings}</span>
              <span className="sync-summary-label">Embeddings</span>
            </div>
            <div className="sync-summary-item">
              <span className="sync-summary-value">{summary.elapsed_seconds}s</span>
              <span className="sync-summary-label">Total Time</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
