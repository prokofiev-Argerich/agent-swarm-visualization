"use client";

import { HUD, STATUS_COLORS, roleColor } from "./uiTokens";
import type { AgentStatus } from "@/lib/agent-status";

type AgentMeta = {
  id: string;
  role: string;
  parentId: string | null;
  createdAt: string;
};

type AgentStatusCardProps = {
  agent: AgentMeta;
  status: AgentStatus;
  recentMessageCount?: number;
  lastActiveAt?: string | null;
  selected?: boolean;
  onClick?: () => void;
};

function fmtTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "no recent activity";
  const dt = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - dt;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function AgentStatusCard({
  agent,
  status,
  recentMessageCount = 0,
  lastActiveAt,
  selected,
  onClick,
}: AgentStatusCardProps) {
  const isKnown = status in STATUS_COLORS;
  const resolvedStatus: AgentStatus = isKnown ? status : "OFFLINE";
  const token = STATUS_COLORS[resolvedStatus];
  const roleC = roleColor(agent.role);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        background: selected ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${selected ? HUD.selectedBorder : HUD.panelBorder}`,
        borderRadius: HUD.panelRadius,
        cursor: "pointer",
        textAlign: "left",
        transition: HUD.hoverTransition,
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.015)";
        }
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = `2px solid ${HUD.accentCyan}`;
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
        e.currentTarget.style.outlineOffset = "0";
      }}
    >
      {/* Top row: status light + role + status label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          title={`status: ${resolvedStatus}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: token.dot,
            boxShadow: token.glow,
            flexShrink: 0,
            animation: resolvedStatus === "BUSY" || resolvedStatus === "ERROR"
              ? "agent-status-pulse 1.5s ease-in-out infinite"
              : undefined,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: roleC,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {agent.role}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            textTransform: "uppercase",
            color: token.text,
            flexShrink: 0,
          }}
        >
          {isKnown ? status : "UNKNOWN"}
        </span>
      </div>

      {/* IDs row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          fontFamily: "ui-monospace, monospace",
          color: HUD.textDim,
          flexWrap: "wrap",
        }}
      >
        <span>{agent.id.slice(0, 8)}</span>
        {agent.parentId && (
          <>
            <span>·</span>
            <span>parent {agent.parentId.slice(0, 8)}</span>
          </>
        )}
      </div>

      {/* Activity row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 9,
          color: HUD.textMuted,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <span>{fmtTimeAgo(lastActiveAt)}</span>
        {recentMessageCount > 0 && (
          <span style={{ color: HUD.accentCyan }}>{recentMessageCount} msg</span>
        )}
      </div>
    </button>
  );
}
