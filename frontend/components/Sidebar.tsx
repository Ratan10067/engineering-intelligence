"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<{ status: string; ollama: string; model?: string } | null>(null);

  useEffect(() => {
    api.healthCheck().then(setHealth).catch(() => setHealth({ status: "error", ollama: "disconnected" }));
    const interval = setInterval(() => {
      api.healthCheck().then(setHealth).catch(() => setHealth({ status: "error", ollama: "disconnected" }));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = health?.ollama === "connected";

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⚡</div>
        <div className="sidebar-logo-text">
          <h1>EngMemory</h1>
          <p>Intelligence Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-title">Core Navigation</div>

        <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
          <div className="nav-item-left">
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </div>
          <span className="nav-badge">Live</span>
        </Link>

        <Link href="/search" className={`nav-item ${pathname === "/search" ? "active" : ""}`}>
          <div className="nav-item-left">
            <span className="nav-icon">🔍</span>
            <span>Hybrid Search</span>
          </div>
          <span className="nav-badge">RRF</span>
        </Link>

        <Link href="/questions" className={`nav-item ${pathname === "/questions" ? "active" : ""}`}>
          <div className="nav-item-left">
            <span className="nav-icon">💬</span>
            <span>Evidence Q&A</span>
          </div>
          <span className="nav-badge">RAG</span>
        </Link>

        <div className="sidebar-section-title" style={{ marginTop: 12 }}>
          Scenarios
        </div>

        <Link href="/questions?q=What%20changed%20between%20the%20last%20two%20releases%3F" className="nav-item">
          <div className="nav-item-left">
            <span className="nav-icon">🚀</span>
            <span style={{ fontSize: "0.82rem" }}>Release Diffs</span>
          </div>
        </Link>

        <Link href="/questions?q=Which%20PRs%20affected%20memory%20or%20performance%3F" className="nav-item">
          <div className="nav-item-left">
            <span className="nav-icon">⚡</span>
            <span style={{ fontSize: "0.82rem" }}>Impact Analysis</span>
          </div>
        </Link>

        <Link href="/questions?q=Why%20was%20this%20architecture%20changed%3F" className="nav-item">
          <div className="nav-item-left">
            <span className="nav-icon">🏛️</span>
            <span style={{ fontSize: "0.82rem" }}>Architecture</span>
          </div>
        </Link>
      </nav>

      {/* System Status Footer */}
      <div className="sidebar-footer">
        <div className="system-status-box">
          <div className="system-status-row">
            <span>Local LLM</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className={`status-dot ${isConnected ? "pulse" : "disconnected"}`} />
              <span style={{ fontWeight: 600, color: isConnected ? "#4ade80" : "#f87171" }}>
                {isConnected ? "Ollama Active" : "Disconnected"}
              </span>
            </div>
          </div>
          <div className="system-status-row" style={{ fontSize: "0.7rem" }}>
            <span>Vector Engine</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--accent-indigo)" }}>
              pgvector 384-d
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
