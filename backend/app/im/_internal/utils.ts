import { SESSION_KEY } from "@/lib/constants";
import type { WorkspaceDefaults } from "./types";

export function loadSession(): WorkspaceDefaults | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceDefaults;
  } catch {
    return null;
  }
}

export function saveSession(session: WorkspaceDefaults) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
     
    console.error("API failed", { url: path, status: res.status, body: text.slice(0, 500) });
    throw new Error(`${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function toTimestamp(value: Date | string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}
