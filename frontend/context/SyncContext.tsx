"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { type Repository } from "@/lib/api";

export interface SyncEvent {
  id: number;
  type: string;
  data: any;
  timestamp: Date;
}

interface SyncContextType {
  activeRepo: Repository | null;
  maxPrs: number;
  isOpen: boolean;
  isMinimized: boolean;
  isSyncing: boolean;
  events: SyncEvent[];
  phase: string;
  isComplete: boolean;
  hasError: boolean;
  summary: any;
  startSync: (repo: Repository, maxPrs?: number) => void;
  openModal: (repo?: Repository) => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
  stop: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const PHASE_LABELS: Record<string, string> = {
  collecting: "Fetching PRs",
  understanding: "LLM Analysis",
  documenting: "Creating Docs",
  embedding: "Embeddings",
};

export const PHASE_ORDER = ["collecting", "understanding", "documenting", "embedding"];

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [activeRepo, setActiveRepo] = useState<Repository | null>(null);
  const [maxPrs, setMaxPrs] = useState(10);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [phase, setPhase] = useState<string>("idle");
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const eventIdRef = useRef(0);

  const addEvent = useCallback((type: string, data: any) => {
    const evt: SyncEvent = {
      id: eventIdRef.current++,
      type,
      data,
      timestamp: new Date(),
    };
    setEvents((prev) => [...prev, evt]);
  }, []);

  const stop = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (activeRepo) {
      try {
        await fetch(`${API_BASE}/api/repositories/${activeRepo.id}/cancel`, { method: "POST" });
      } catch {
        // ignore
      }
    }
    setIsSyncing(false);
    setPhase("cancelled");
    addEvent("system", { message: "Sync cancelled by user" });
  }, [activeRepo, addEvent]);

  const startSync = useCallback((repo: Repository, prCount: number = 10) => {
    // If currently running sync for another repo, close previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setActiveRepo(repo);
    setMaxPrs(prCount);
    setIsOpen(true);
    setIsMinimized(false);
    setIsSyncing(true);
    setIsComplete(false);
    setHasError(false);
    setEvents([]);
    setPhase("collecting");
    setSummary(null);

    const url = `${API_BASE}/api/repositories/${repo.id}/sync/live?max_prs=${prCount}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    addEvent("system", { message: `Connecting to sync stream for ${repo.full_name}...` });

    es.addEventListener("phase", (e) => {
      const data = JSON.parse(e.data);
      setPhase(data.phase);
      addEvent("phase", data);
    });

    es.addEventListener("fetch_summary", (e) => {
      addEvent("fetch_summary", JSON.parse(e.data));
    });

    es.addEventListener("pr_fetched", (e) => {
      addEvent("pr_fetched", JSON.parse(e.data));
    });

    es.addEventListener("pr_error", (e) => {
      addEvent("pr_error", JSON.parse(e.data));
    });

    es.addEventListener("llm_start", (e) => {
      addEvent("llm_start", JSON.parse(e.data));
    });

    es.addEventListener("pr_understood", (e) => {
      addEvent("pr_understood", JSON.parse(e.data));
    });

    es.addEventListener("llm_failed", (e) => {
      addEvent("llm_failed", JSON.parse(e.data));
    });

    es.addEventListener("docs_created", (e) => {
      addEvent("docs_created", JSON.parse(e.data));
    });

    es.addEventListener("embeddings_done", (e) => {
      addEvent("embeddings_done", JSON.parse(e.data));
    });

    es.addEventListener("completed", (e) => {
      const data = JSON.parse(e.data);
      setSummary(data);
      setIsComplete(true);
      setIsSyncing(false);
      setPhase("completed");
      addEvent("completed", data);
      es.close();
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as any).data);
        addEvent("error", data);
      } catch {
        addEvent("error", { message: "Connection lost" });
      }
      setHasError(true);
      setIsSyncing(false);
      es.close();
    });
  }, [addEvent]);

  const openModal = useCallback((repo?: Repository) => {
    if (repo && (!activeRepo || activeRepo.id !== repo.id)) {
      startSync(repo, maxPrs);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [activeRepo, maxPrs, startSync]);

  const minimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const restore = useCallback(() => {
    setIsMinimized(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <SyncContext.Provider
      value={{
        activeRepo,
        maxPrs,
        isOpen,
        isMinimized,
        isSyncing,
        events,
        phase,
        isComplete,
        hasError,
        summary,
        startSync,
        openModal,
        minimize,
        restore,
        close,
        stop,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return ctx;
}
