/**
 * Single source of truth for Agent UI status.
 *
 * Frontend-only — backend SSE events don't transmit this value;
 * /im and /graph both infer status from event names (llm.start → BUSY, …).
 *
 * Status color tokens live alongside this enum in
 * `app/im/components/uiTokens.ts` (STATUS_COLORS).
 */
export type AgentStatus = "IDLE" | "BUSY" | "WAKING" | "ERROR" | "OFFLINE";

export const ALL_AGENT_STATUSES: readonly AgentStatus[] = [
  "IDLE",
  "BUSY",
  "WAKING",
  "ERROR",
  "OFFLINE",
] as const;
