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

  useEffect(() => {
    api.getRepositories().then(setRepos).catch(console.error);
  }, []);

  return (
    <header className="header">
      <div className="header-title-group">
        <div className="header-title">{title}</div>
      </div>

      <div className="header-actions">
        {repos.length > 0 && onSelectRepo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 600 }}>
              REPOSITORY:
            </span>
            <select
              className="filter-select"
              style={{ padding: "6px 28px 6px 12px", fontSize: "0.82rem" }}
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
          </div>
        )}

        <Link href="/questions" className="btn btn-primary btn-sm">
          ✨ Ask AI
        </Link>
      </div>
    </header>
  );
}
