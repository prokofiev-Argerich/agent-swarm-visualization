import { safeJsonParse, isUuid } from "../utils";
import type { ToolResult } from "./types";

export function parseArgs<T>(text: string, fallback: T = {} as T): T {
  return safeJsonParse<T>(text, fallback);
}

export function requireParam(
  value: string | undefined | null,
  name: string
): ToolResult | null {
  if (!(value ?? "").trim()) {
    return { ok: false, error: `Missing ${name}` };
  }
  return null;
}

export function requireUuid(
  value: string,
  name: string,
  hint?: string
): ToolResult | null {
  if (!isUuid(value)) {
    const suffix = hint ? ` ${hint}` : "";
    return {
      ok: false,
      error: `${name} must be a UUID (got '${value.slice(0, 64)}').${suffix}`,
    };
  }
  return null;
}

export function requireAllUuids(
  values: string[],
  name: string,
  hint?: string
): ToolResult | null {
  const invalid = values.filter((id) => !isUuid(id));
  if (invalid.length > 0) {
    const suffix = hint ? ` ${hint}` : "";
    return {
      ok: false,
      error: `${name} must all be UUID agent_ids. Invalid: ${invalid.map((id) => `'${id.slice(0, 64)}'`).join(", ")}.${suffix}`,
    };
  }
  return null;
}

export function requireGroupMembership(
  members: string[],
  agentId: string
): ToolResult | null {
  if (!members.includes(agentId)) {
    return { ok: false, error: "Access denied" };
  }
  return null;
}
