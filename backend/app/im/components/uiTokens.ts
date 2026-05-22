// EVE Online 风格 HUD design tokens for IM workbench
// 暗底 / 半透明 / 细线 / 局部 cyan-amber-violet glow / 信息密度高 / 可读性优先

import type { AgentStatus } from "@/lib/agent-status";
export type { AgentStatus } from "@/lib/agent-status";

export const HUD = {
  // panel
  panelBg: "rgba(255, 255, 255, 0.82)",
  panelBgOpaque: "#ffffff",
  panelBorder: "rgba(148, 163, 184, 0.45)",
  panelBorderStrong: "rgba(100, 116, 139, 0.55)",
  panelBlur: "blur(12px)",
  panelShadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
  panelRadius: 8,

  // grid background (page-level)
  pageBg: "#f1f5f9",
  pageBgGrid:
    "radial-gradient(circle at 18% 18%, rgba(56,189,248,0.06), transparent 42%), radial-gradient(circle at 82% 78%, rgba(168,85,247,0.04), transparent 48%), linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px) 0 0 / 24px 24px, #f1f5f9",

  // text
  textPrimary: "#0f172a", // slate-900
  textSecondary: "#475569", // slate-600
  textMuted: "#64748b", // slate-500
  textDim: "#94a3b8", // slate-400

  // accents
  accentCyan: "#0891b2",
  accentAmber: "#d97706",
  accentViolet: "#7c3aed",
  accentRed: "#dc2626",

  // selected message
  selectedBorder: "rgba(8, 145, 178, 0.60)",
  selectedGlow: "0 0 0 1px rgba(8,145,178,0.60), 0 0 12px rgba(8,145,178,0.18)",
  selectedBg: "rgba(8, 145, 178, 0.06)",

  // caused_by jump highlight (amber)
  causalFlashColor: "#d97706",
  causalFlashGlow: "0 0 0 1px rgba(217,119,6,0.55), 0 0 16px rgba(217,119,6,0.22)",

  // small label / uppercase
  labelLetterSpacing: "0.08em",

  // animation
  hoverTransition: "all 150ms ease",
  selectionTransition: "all 200ms ease",
  jumpHighlightMs: 1500,
  busyPulseSec: 2,
} as const;

export const STATUS_COLORS: Record<AgentStatus, {
  dot: string;
  border: string;
  bg: string;
  text: string;
  glow: string;
}> = {
  IDLE: {
    dot: "#0891b2",
    border: "rgba(8,145,178,0.35)",
    bg: "rgba(8,145,178,0.08)",
    text: "#0e7490",
    glow: "0 0 8px rgba(8,145,178,0.20)",
  },
  BUSY: {
    dot: "#d97706",
    border: "rgba(217,119,6,0.40)",
    bg: "rgba(217,119,6,0.08)",
    text: "#b45309",
    glow: "0 0 10px rgba(217,119,6,0.30)",
  },
  WAKING: {
    dot: "#7c3aed",
    border: "rgba(124,58,237,0.35)",
    bg: "rgba(124,58,237,0.06)",
    text: "#6d28d9",
    glow: "0 0 8px rgba(124,58,237,0.20)",
  },
  ERROR: {
    dot: "#dc2626",
    border: "rgba(220,38,38,0.40)",
    bg: "rgba(220,38,38,0.06)",
    text: "#b91c1c",
    glow: "0 0 10px rgba(220,38,38,0.25)",
  },
  OFFLINE: {
    dot: "#64748b",
    border: "rgba(100,116,139,0.30)",
    bg: "rgba(100,116,139,0.05)",
    text: "#475569",
    glow: "none",
  },
};

// 按 role 推断颜色（agent 节点配色,跟 graph 一致）
export const ROLE_COLORS: Record<string, string> = {
  human: "#22c55e",
  assistant: "#38bdf8",
  coder: "#f97316",
  researcher: "#a855f7",
  reviewer: "#eab308",
  orchestrator: "#ec4899",
  productmanager: "#06b6d4",
  devlead: "#f43f5e",
  pm: "#06b6d4",
};

export function roleColor(role?: string | null): string {
  if (!role) return "#71717a";
  return ROLE_COLORS[role.toLowerCase()] ?? "#71717a";
}

// 边缘新鲜度 → 颜色 (causal edge in graph)
export function edgeColorByFreshness(lastAt: string | undefined | null, now: number): string {
  if (!lastAt) return "#3f3f46";
  const dt = now - new Date(lastAt).getTime();
  if (dt < 60_000) return "#22d3ee"; // < 1 min: bright cyan
  if (dt < 3_600_000) return "#3b82f6"; // < 1 hr: blue
  if (dt < 86_400_000) return "#6366f1"; // < 1 day: indigo
  return "#3f3f46"; // older: dim gray
}
