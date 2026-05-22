import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveBashShell } from "../config/shell-config";
import { parseArgs, requireParam } from "./validate";
import type { RuntimeTool } from "./types";

export const shellTools: RuntimeTool[] = [
  {
    name: "bash",
    definition: {
      type: "function",
      function: {
        name: "bash",
        description:
          "Run a shell command on the server. Returns stdout/stderr/exitCode. Use for debugging or file operations.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            command: { type: "string", description: "Shell command to execute" },
            cwd: { type: "string", description: "Working directory (relative to workspace root or absolute)" },
            timeoutMs: { type: "number", description: "Timeout in milliseconds (default 120000)" },
            maxOutputKB: { type: "number", description: "Maximum combined output size in KB (default 1024)" },
          },
          required: ["command"],
        },
      },
    },
    async execute(call, _context) {
      const args = parseArgs<{
        command?: string;
        cwd?: string;
        timeoutMs?: number;
        maxOutputKB?: number;
      }>(call.argumentsText);
      const command = (args.command ?? "").trim();
      const missing = requireParam(command, "command");
      if (missing) return missing;

      const workspaceRoot = process.env.AGENT_WORKDIR ?? process.cwd();
      const requestedCwd = (args.cwd ?? "").trim();
      let finalCwd = workspaceRoot;
      if (requestedCwd) {
        const resolved = path.isAbsolute(requestedCwd)
          ? requestedCwd
          : path.resolve(workspaceRoot, requestedCwd);
        const rootResolved = path.resolve(workspaceRoot);
        if (!resolved.startsWith(rootResolved)) {
          return { ok: false, error: "cwd must be within workspace root", workspaceRoot };
        }
        finalCwd = resolved;
      }

      const timeoutMs = Number(args.timeoutMs) > 0 ? Number(args.timeoutMs) : 120000;
      const maxOutputKB = Number(args.maxOutputKB) > 0 ? Number(args.maxOutputKB) : 1024;
      const maxBuffer = Math.max(64 * 1024, Math.floor(maxOutputKB * 1024));
      const execAsync = promisify(exec);
      const { shell, fallback } = resolveBashShell();
      const fallbackWarning = fallback
        ? "POSIX bash syntax may not work; falling back to platform default shell"
        : undefined;

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: finalCwd,
          timeout: timeoutMs,
          maxBuffer,
          shell,
        });
        return {
          ok: true,
          stdout,
          stderr,
          exitCode: 0,
          cwd: finalCwd,
          shell,
          fallback,
          ...(fallbackWarning ? { warning: fallbackWarning } : {}),
        };
      } catch (err: any) {
        const stdout = err?.stdout ?? "";
        const stderr = err?.stderr ?? "";
        const exitCode = typeof err?.code === "number" ? err.code : null;
        const signal = typeof err?.signal === "string" ? err.signal : null;
        return {
          ok: false,
          stdout,
          stderr,
          exitCode,
          signal,
          cwd: finalCwd,
          shell,
          fallback,
          ...(fallbackWarning ? { warning: fallbackWarning } : {}),
          error: String(err?.message ?? err),
        };
      }
    },
  },
];
