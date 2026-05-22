import type { RuntimeTool, ToolContext, ToolResult } from "./types";
import type { ToolCall } from "../types";

export class ToolRegistry {
  private tools = new Map<string, RuntimeTool>();

  constructor(tools: RuntimeTool[]) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: RuntimeTool) {
    if (tool.definition.function.name !== tool.name) {
      throw new Error(`Tool name mismatch: definition has "${tool.definition.function.name}" but tool has "${tool.name}"`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  has(name: string) {
    return this.tools.has(name);
  }

  getDefinitions() {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  async execute(call: ToolCall, context: ToolContext): Promise<ToolResult> {
    const name = call.name ?? "";
    const tool = this.tools.get(name);

    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }

    return tool.execute(call, context);
  }
}
