"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSidebar } from "@/context/SidebarContext";

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [health, setHealth] = useState<{ status: string; ollama: string } | null>(null);

  useEffect(() => {
    api.healthCheck().then(setHealth).catch(() => setHealth({ status: "error", ollama: "disconnected" }));
  }, []);

  const isConnected = health?.ollama === "connected";

  return (
    <aside className={`sidebar ${isCollapsed ? "sidebar--is-collapsed" : ""}`}>
      {/* Brand Header */}
      <div className="sidebar-logo">
        <div className="sidebar-brand" title="Engineering Intelligence Platform">
          <span className="sidebar-logo-icon">⚡</span>
          {!isCollapsed && <span className="sidebar-brand-text">Engineering Intelligence</span>}
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title={isCollapsed ? "Expand sidebar (◧)" : "Collapse sidebar (◧)"}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? "»" : "«"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <Link
          href="/"
          className={`nav-item ${pathname === "/" ? "active" : ""}`}
          title={isCollapsed ? "Dashboard" : undefined}
        >
          <span className="nav-item-icon">📊</span>
          {!isCollapsed && <span className="nav-item-label">Dashboard</span>}
        </Link>

        <Link
          href="/search"
          className={`nav-item ${pathname === "/search" ? "active" : ""}`}
          title={isCollapsed ? "Search" : undefined}
        >
          <span className="nav-item-icon">🔍</span>
          {!isCollapsed && <span className="nav-item-label">Search</span>}
        </Link>

        <Link
          href="/questions"
          className={`nav-item ${pathname === "/questions" ? "active" : ""}`}
          title={isCollapsed ? "Evidence Q&A" : undefined}
        >
          <span className="nav-item-icon">💬</span>
          {!isCollapsed && <span className="nav-item-label">Q&A</span>}
        </Link>

        <div className="sidebar-section-title">
          {!isCollapsed ? "Common Queries" : "···"}
        </div>

        <Link
          href="/questions?q=What%20changed%20between%20the%20last%20two%20releases%3F"
          className="nav-item"
          title={isCollapsed ? "Release Comparison" : undefined}
        >
          <span className="nav-item-icon">🚀</span>
          {!isCollapsed && <span className="nav-item-label">Release Comparison</span>}
        </Link>

        <Link
          href="/questions?q=Which%20PRs%20affected%20memory%20or%20performance%3F"
          className="nav-item"
          title={isCollapsed ? "Impact Search" : undefined}
        >
          <span className="nav-item-icon">⚡</span>
          {!isCollapsed && <span className="nav-item-label">Impact Search</span>}
        </Link>

        <Link
          href="/questions?q=Why%20was%20this%20architecture%20changed%3F"
          className="nav-item"
          title={isCollapsed ? "Architecture Decision" : undefined}
        >
          <span className="nav-item-icon">🏛️</span>
          {!isCollapsed && <span className="nav-item-label">Architecture Decision</span>}
        </Link>
      </nav>

      {/* System Status Footer */}
      <div
        className="sidebar-footer"
        title={`Ollama LLM: ${isConnected ? "Connected" : "Offline"}`}
      >
        {!isCollapsed && <span>Ollama LLM:</span>}
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
          <span className={`status-dot ${!isConnected ? "disconnected" : ""}`} />
          {!isCollapsed && (isConnected ? "Connected" : "Offline")}
        </span>
      </div>
    </aside>
  );
}
