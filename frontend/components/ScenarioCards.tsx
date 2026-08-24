"use client";

import { useRouter } from "next/navigation";

export interface Scenario {
  id: string;
  title: string;
  scenarioType: string;
  description: string;
  icon: string;
  gradient: string;
  defaultQuestion: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "release-diff",
    title: "Release Comparison",
    scenarioType: "Scenario 1",
    description: "Compare what functional and architectural changes occurred between specific release milestones.",
    icon: "🚀",
    gradient: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
    defaultQuestion: "What changed between the last two releases?",
  },
  {
    id: "regression-history",
    title: "Historical Issue & Bug Search",
    scenarioType: "Scenario 2",
    description: "Find past PRs, bug reports, and resolution discussions to investigate whether a current defect was seen before.",
    icon: "🐛",
    gradient: "linear-gradient(135deg, rgba(244, 63, 94, 0.2), rgba(245, 158, 11, 0.1))",
    defaultQuestion: "Have we seen memory leaks or caching regression issues before?",
  },
  {
    id: "impact-analysis",
    title: "Impact & Performance Search",
    scenarioType: "Scenario 3",
    description: "Discover which engineering changes directly impacted memory footprints, latencies, or component APIs.",
    icon: "⚡",
    gradient: "linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(16, 185, 129, 0.1))",
    defaultQuestion: "Which PRs affected memory usage or backend performance?",
  },
  {
    id: "architecture-decisions",
    title: "Decision Understanding",
    scenarioType: "Scenario 4",
    description: "Inspect why foundational subsystems were restructured, backed by documented review debates.",
    icon: "🏛️",
    gradient: "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.1))",
    defaultQuestion: "Why was the caching architecture changed?",
  },
];

export function ScenarioCards() {
  const router = useRouter();

  const handleLaunch = (question: string) => {
    router.push(`/questions?q=${encodeURIComponent(question)}`);
  };

  return (
    <div className="scenario-grid stagger-children">
      {SCENARIOS.map((s) => (
        <div
          key={s.id}
          className="scenario-card animate-fade-in"
          style={{ background: s.gradient }}
          onClick={() => handleLaunch(s.defaultQuestion)}
        >
          <div className="scenario-header">
            <div className="scenario-icon-wrap">{s.icon}</div>
            <div>
              <span className="badge badge-indigo" style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                {s.scenarioType}
              </span>
              <div className="scenario-title">{s.title}</div>
            </div>
          </div>
          <p className="scenario-desc">{s.description}</p>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--accent-indigo)", fontWeight: 600 }}>
              Launch Query ↗
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontFamily: "JetBrains Mono" }}>
              1-Click RAG
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
