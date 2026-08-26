"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  expand: () => void;
  collapse: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

const STORAGE_KEY = "ei_sidebar_collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    try {
      localStorage.setItem(STORAGE_KEY, "false");
    } catch {
      // ignore
    }
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, expand, collapse }}>
      <div className={`app-shell ${mounted && isCollapsed ? "sidebar--collapsed" : ""}`}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
