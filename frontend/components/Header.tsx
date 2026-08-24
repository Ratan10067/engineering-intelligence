"use client";

import { useEffect, useState } from "react";
import { api, type Repository } from "@/lib/api";
import Link from "next/link";

interface HeaderProps {
  title?: string;
  selectedRepoId?: number;
  onSelectRepo?: (id: number | undefined) => void;
}

export function Header({ title = "Engineering Memory", selectedRepoId, onSelectRepo }: HeaderProps) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);

    // Initialize theme from document or localStorage
    const savedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  return (
    <header className="header">
      <div className="header-title">{title}</div>

      <div className="header-actions">
        {repos.length > 0 && onSelectRepo && (
          <select
            className="filter-select"
            value={selectedRepoId || ""}
            onChange={(e) => onSelectRepo(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All Repositories ({repos.length})</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        )}

        {/* Dark / White Theme Toggle */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={toggleTheme}
          title="Toggle Dark / Light Theme"
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>

        <Link href="/questions" className="btn btn-primary btn-sm">
          Ask Question
        </Link>
      </div>
    </header>
  );
}
