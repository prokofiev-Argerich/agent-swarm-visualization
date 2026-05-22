import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./registry";
import type { RuntimeTool } from "./types";

function makeTool(name: string): RuntimeTool {
  return {
    name,
    definition: {
      type: "function",
      function: {
        name,
        description: `Tool: ${name}`,
        parameters: { type: "object", properties: {} },
      },
    },
    async execute() {
      return { ok: true, name };
    },
  };
}

describe("ToolRegistry", () => {
  it("registers a tool and retrieves its definition", () => {
    const tool = makeTool("test_tool");
    const registry = new ToolRegistry([tool]);

    expect(registry.has("test_tool")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].function.name).toBe("test_tool");
  });

  it("throws on name mismatch between tool.name and definition.function.name", () => {
    const bad: RuntimeTool = {
      name: "foo",
      definition: {
        type: "function",
        function: {
          name: "bar",
          description: "mismatch",
          parameters: {},
        },
      },
      async execute() {
        return { ok: true };
      },
    };

    expect(() => new ToolRegistry([bad])).toThrow("Tool name mismatch");
  });

  it("throws on duplicate tool name", () => {
    const t1 = makeTool("dup");
    const t2 = makeTool("dup");
    expect(() => new ToolRegistry([t1, t2])).toThrow("Duplicate tool");
  });

  it("registers multiple tools", () => {
    const tools = [makeTool("a"), makeTool("b"), makeTool("c")];
    const registry = new ToolRegistry(tools);

    expect(registry.has("a")).toBe(true);
    expect(registry.has("b")).toBe(true);
    expect(registry.has("c")).toBe(true);

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(3);
  });

  it("execute returns error for unknown tool", async () => {
    const registry = new ToolRegistry([]);
    const result = await registry.execute(
      { index: 0, name: "ghost", argumentsText: "{}" },
      {} as any
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("execute calls the tool's execute method", async () => {
    let called = false;
    const tool: RuntimeTool = {
      name: "echo",
      definition: {
        type: "function",
        function: { name: "echo", description: "echo", parameters: {} },
      },
      async execute(call, ctx) {
        called = true;
        return { ok: true, agentId: ctx.agentId };
      },
    };

    const registry = new ToolRegistry([tool]);
    const ctx = {
      agentId: "agent-1",
      workspaceId: "ws-1",
      groupId: "g-1",
      currentGroupId: null,
      bus: {} as any,
      ensureRunner: () => {},
      wakeAgent: () => {},
    };

    const result = await registry.execute(
      { index: 0, name: "echo", argumentsText: "{}" },
      ctx
    );

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    expect((result as any).agentId).toBe("agent-1");
  });
});
