"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<{ status: string; ollama: string } | null>(null);

  useEffect(() => {
    api.healthCheck().then(setHealth).catch(() => setHealth({ status: "error", ollama: "disconnected" }));
  }, []);

  const isConnected = health?.ollama === "connected";

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-logo">
        <span style={{ fontSize: "1.2rem" }}>⚡</span>
        <span>Engineering Intelligence</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
          <span>📊</span>
          <span>Dashboard</span>
        </Link>

        <Link href="/search" className={`nav-item ${pathname === "/search" ? "active" : ""}`}>
          <span>🔍</span>
          <span>Search</span>
        </Link>

        <Link href="/questions" className={`nav-item ${pathname === "/questions" ? "active" : ""}`}>
          <span>💬</span>
          <span>Q&A</span>
        </Link>

        <div className="sidebar-section-title">Common Queries</div>

        <Link href="/questions?q=What%20changed%20between%20the%20last%20two%20releases%3F" className="nav-item">
          <span>🚀</span>
          <span>Release Comparison</span>
        </Link>

        <Link href="/questions?q=Which%20PRs%20affected%20memory%20or%20performance%3F" className="nav-item">
          <span>⚡</span>
          <span>Impact Search</span>
        </Link>

        <Link href="/questions?q=Why%20was%20this%20architecture%20changed%3F" className="nav-item">
          <span>🏛️</span>
          <span>Architecture Decision</span>
        </Link>
      </nav>

      {/* System Status Footer */}
      <div className="sidebar-footer">
        <span>Ollama LLM:</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
          <span className={`status-dot ${!isConnected ? "disconnected" : ""}`} />
          {isConnected ? "Connected" : "Offline"}
        </span>
      </div>
    </aside>
  );
}
