import { existsSync } from "node:fs";

let cachedBashShell: { shell: string; fallback: boolean } | null = null;

export function resolveBashShell(): { shell: string; fallback: boolean } {
  if (cachedBashShell) return cachedBashShell;

  const override = process.env.AGENT_SHELL?.trim();
  if (override) {
    cachedBashShell = { shell: override, fallback: false };
    return cachedBashShell;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        cachedBashShell = { shell: candidate, fallback: false };
        return cachedBashShell;
      }
    }
    cachedBashShell = { shell: process.env.ComSpec ?? "cmd.exe", fallback: true };
    return cachedBashShell;
  }

  cachedBashShell = { shell: "/bin/bash", fallback: false };
  return cachedBashShell;
}
