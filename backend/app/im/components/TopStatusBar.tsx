"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { HUD, STATUS_COLORS } from "./uiTokens";

export type AgentStats = {
  total: number;
  idle: number;
  busy: number;
  waking: number;
  error: number;
  offline: number;
};

export type MessageStats = {
  total: number;
  causedByCount: number;
};

type TopStatusBarProps = {
  workspaceId?: string | null;
  groupName?: string | null;
  groupId?: string | null;
  agents: AgentStats;
  messages: MessageStats;
  onRefresh?: () => void;
  onStopAll?: () => void;
  stoppingAgents?: boolean;
  status?: string;
};

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: "cyan" | "amber" | "violet" | "red" | undefined;
}) {
  const accentColor =
    accent === "amber"
      ? HUD.accentAmber
      : accent === "violet"
        ? HUD.accentViolet
        : accent === "red"
          ? HUD.accentRed
          : accent === "cyan"
            ? HUD.accentCyan
            : HUD.textPrimary;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: HUD.labelLetterSpacing,
          textTransform: "uppercase",
          color: HUD.textDim,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accentColor,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPip({
  color,
  count,
  label,
  pulse,
}: {
  color: string;
  count: number;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div
      title={`${label}: ${count}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: count > 0 ? 1 : 0.4,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: count > 0 ? `0 0 6px ${color}` : "none",
          animation: pulse && count > 0 ? "hud-status-pulse 1.6s ease-in-out infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: count > 0 ? HUD.textSecondary : HUD.textDim,
          fontFamily: "ui-monospace, monospace",
          minWidth: 12,
        }}
      >
        {count}
      </span>
    </div>
  );
}

export function TopStatusBar({
  workspaceId,
  groupName,
  groupId,
  agents,
  messages,
  onRefresh,
  onStopAll,
  stoppingAgents,
  status,
}: TopStatusBarProps) {
  return (
    <div
      style={{
        height: 56,
        background: HUD.panelBg,
        borderBottom: `1px solid ${HUD.panelBorder}`,
        backdropFilter: HUD.panelBlur,
        WebkitBackdropFilter: HUD.panelBlur,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 20,
        flexShrink: 0,
        color: HUD.textPrimary,
        position: "relative",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 140 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: HUD.accentCyan,
            textShadow: `0 0 8px ${HUD.accentCyan}40`,
          }}
        >
          IM · WORKBENCH
        </span>
        {workspaceId && (
          <span
            style={{
              fontSize: 9,
              color: HUD.textDim,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.04em",
            }}
            title={workspaceId}
          >
            ws/{workspaceId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Group */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          borderLeft: `1px solid ${HUD.panelBorder}`,
          paddingLeft: 16,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            textTransform: "uppercase",
            color: HUD.textDim,
          }}
        >
          Group
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: HUD.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 260,
          }}
          title={groupId ?? undefined}
        >
          {groupName ?? <span style={{ color: HUD.textDim }}>— no group —</span>}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Agent stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <StatBlock label="AGENTS" value={agents.total} accent="cyan" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusPip color={STATUS_COLORS.BUSY.dot} count={agents.busy} label="busy" pulse />
          <StatusPip color={STATUS_COLORS.WAKING.dot} count={agents.waking} label="waking" pulse />
          <StatusPip color={STATUS_COLORS.IDLE.dot} count={agents.idle} label="idle" />
          {agents.error > 0 && (
            <StatusPip color={STATUS_COLORS.ERROR.dot} count={agents.error} label="error" pulse />
          )}
        </div>
      </div>

      {/* Message stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderLeft: `1px solid ${HUD.panelBorder}`, paddingLeft: 16 }}>
        <StatBlock label="MSG" value={messages.total} />
        <StatBlock label="CAUSAL" value={messages.causedByCount} accent="amber" />
      </div>

      {/* Status text */}
      {status && status !== "idle" && (
        <div
          style={{
            fontSize: 10,
            color: HUD.accentCyan,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            animation: "hud-pulse 1.5s ease-in-out infinite",
          }}
        >
          {status}…
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderLeft: `1px solid ${HUD.panelBorder}`,
          paddingLeft: 16,
        }}
      >
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh"
            aria-label="Refresh"
            style={{
              padding: 0,
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid ${HUD.panelBorder}`,
              borderRadius: 4,
              color: HUD.textSecondary,
              cursor: "pointer",
              transition: HUD.hoverTransition,
            }}
          >
            <RefreshCw size={12} strokeWidth={2.2} />
          </button>
        )}
        <Link
          href="/graph"
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            background: "transparent",
            border: `1px solid ${HUD.panelBorder}`,
            borderRadius: 4,
            color: HUD.accentCyan,
            textDecoration: "none",
            letterSpacing: "0.04em",
            transition: HUD.hoverTransition,
          }}
        >
          GRAPH
        </Link>
        {onStopAll && (
          <button
            type="button"
            onClick={onStopAll}
            disabled={stoppingAgents || agents.busy === 0}
            title="Interrupt all running agents"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              background: stoppingAgents ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.06)",
              border: `1px solid ${STATUS_COLORS.ERROR.border}`,
              borderRadius: 4,
              color: STATUS_COLORS.ERROR.text,
              cursor: stoppingAgents || agents.busy === 0 ? "default" : "pointer",
              opacity: stoppingAgents || agents.busy === 0 ? 0.5 : 1,
              letterSpacing: "0.04em",
              transition: HUD.hoverTransition,
            }}
          >
            {stoppingAgents ? "STOPPING…" : "STOP ALL"}
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes hud-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes hud-status-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.65; }
        }
      `}</style>
    </div>
  );
}
