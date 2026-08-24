import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engineering Intelligence Platform",
  description:
    "AI-powered platform that converts GitHub engineering history into searchable Engineering Memory with evidence-backed Q&A.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ Eng Intelligence</h1>
        <p>Engineering Memory</p>
      </div>
      <nav className="sidebar-nav">
        <a href="/" className="nav-item">
          <span className="nav-icon">📊</span>
          Dashboard
        </a>
        <a href="/search" className="nav-item">
          <span className="nav-icon">🔍</span>
          Search
        </a>
        <a href="/questions" className="nav-item">
          <span className="nav-icon">💬</span>
          Ask Questions
        </a>
      </nav>
      <div className="sidebar-footer">
        <div className="status-badge">
          <span className="status-dot" id="ollama-status"></span>
          Ollama Connected
        </div>
      </div>
    </aside>
  );
}
