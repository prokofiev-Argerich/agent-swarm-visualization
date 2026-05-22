import { getMcpRegistry } from "../mcp";
import { safeJsonParse } from "../utils";
import type { RuntimeTool } from "./types";

const BUILTIN_TOOL_NAMES: Set<string> = new Set();

export function setBuiltinToolNames(names: Set<string>) {
  for (const name of names) {
    BUILTIN_TOOL_NAMES.add(name);
  }
}

export async function executeMcpTool(name: string, argumentsText: string) {
  const mcp = await getMcpRegistry(BUILTIN_TOOL_NAMES);
  if (!mcp.hasTool(name)) {
    return null; // not an MCP tool
  }
  const args = safeJsonParse<Record<string, unknown>>(argumentsText, {});
  return mcp.callTool(name, args);
}
