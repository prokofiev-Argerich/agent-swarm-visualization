import { identityTools } from "./identity-tools";
import { fileTools } from "./file-tools";
import { shellTools } from "./shell-tool";
import { agentTools } from "./agent-tools";
import { groupTools } from "./group-tools";
import { messageTools } from "./message-tools";
import { workflowTools } from "./workflow-tools";
import { ToolRegistry } from "./registry";
import { setBuiltinToolNames } from "./mcp-tool-adapter";
import { getMcpRegistry } from "../mcp";
import type { RuntimeTool, ToolContext, ToolResult } from "./types";
import type { ToolCall } from "../types";

export const ALL_BUILTIN_TOOLS: RuntimeTool[] = [
  ...identityTools,
  ...fileTools,
  ...shellTools,
  ...agentTools,
  ...groupTools,
  ...messageTools,
  ...workflowTools,
];

export const BUILTIN_TOOL_NAMES = new Set(ALL_BUILTIN_TOOLS.map((t) => t.name));

// Initialize MCP adapter's reserved names
setBuiltinToolNames(BUILTIN_TOOL_NAMES);

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry(ALL_BUILTIN_TOOLS);
}

export async function getAgentTools(): Promise<Array<Record<string, unknown>>> {
  const loadTimeoutMs =
    Number(process.env.MCP_LOAD_TIMEOUT_MS) > 0 ? Number(process.env.MCP_LOAD_TIMEOUT_MS) : 2000;
  const mcp = await getMcpRegistry(BUILTIN_TOOL_NAMES, { loadTimeoutMs });
  const mcpTools = mcp.getToolDefinitions();
  const builtinDefs = ALL_BUILTIN_TOOLS.map((t) => t.definition);
  return [...builtinDefs, ...mcpTools];
}

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(call: ToolCall, context: ToolContext): Promise<ToolResult> {
    const name = call.name ?? "";

    // Try builtin registry first
    if (this.registry.has(name)) {
      return this.registry.execute(call, context);
    }

    // Fallback to MCP
    const { executeMcpTool } = await import("./mcp-tool-adapter");
    const mcpResult = await executeMcpTool(name, call.argumentsText);
    if (mcpResult) return mcpResult;

    return { ok: false, error: `Unknown tool: ${name}` };
  }
}
