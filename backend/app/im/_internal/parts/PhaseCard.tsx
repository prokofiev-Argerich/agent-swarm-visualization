"use client";

import type { PhaseSummary } from "../types";

type Props = {
  summary: PhaseSummary;
  expanded: boolean;
  onToggle: (phaseId: string) => void;
};

export function PhaseCard({ summary: s, expanded, onToggle }: Props) {
  const agentList = s.agents.length > 0 ? s.agents.join(" / ") : "";
  return (
    <div
      key={`phase-${s.phaseId}`}
      style={{
        marginBottom: 12,
        border: "1px solid #27272a",
        borderRadius: 12,
        background: "#08080a",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => onToggle(s.phaseId)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          color: "#e4e4e7",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            {s.messageCount} msgs
            {agentList ? ` · ${agentList}` : ""}
            {s.conflicts > 0 ? ` · ${s.conflicts} conflicts` : ""}
            {s.decisions > 0 ? ` · ${s.decisions} decisions` : ""}
          </div>
        </div>
        <span style={{ color: "#a1a1aa", fontSize: 12, flexShrink: 0 }}>
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>
      {expanded && s.summary && (
        <div
          style={{
            padding: "8px 14px 12px",
            fontSize: 12,
            color: "#a1a1aa",
            borderTop: "1px solid #18181b",
            whiteSpace: "pre-wrap",
          }}
        >
          {s.summary}
        </div>
      )}
    </div>
  );
}
