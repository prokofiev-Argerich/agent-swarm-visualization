import { describe, it, expect } from "vitest";
import { ALL_BUILTIN_TOOLS, BUILTIN_TOOL_NAMES, getAgentTools } from "./builtin-tools";

describe("tool schema consistency", () => {
  it("every builtin tool has name matching definition.function.name", () => {
    for (const tool of ALL_BUILTIN_TOOLS) {
      expect(tool.definition.function.name).toBe(tool.name);
    }
  });

  it("no duplicate tool names", () => {
    const names = ALL_BUILTIN_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("add_group_members is in ALL_BUILTIN_TOOLS", () => {
    expect(BUILTIN_TOOL_NAMES.has("add_group_members")).toBe(true);
  });

  it("all required tools are present", () => {
    const required = [
      "self",
      "get_skill",
      "read_file",
      "write_file",
      "bash",
      "create",
      "list_agents",
      "send",
      "list_groups",
      "list_group_members",
      "add_group_members",
      "create_group",
      "send_group_message",
      "send_direct_message",
      "get_group_messages",
      "start_phase",
      "end_phase",
    ];

    for (const name of required) {
      expect(BUILTIN_TOOL_NAMES.has(name)).toBe(true);
    }
  });

  it("every tool has an execute function", () => {
    for (const tool of ALL_BUILTIN_TOOLS) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("getAgentTools returns builtin tools with type function format", async () => {
    // Restore env after test
    const orig = process.env.MCP_LOAD_TIMEOUT_MS;
    process.env.MCP_LOAD_TIMEOUT_MS = "1"; // speed up test by using short timeout

    try {
      const tools = await getAgentTools();
      // At minimum, builtin tools are present
      expect(tools.length).toBeGreaterThanOrEqual(ALL_BUILTIN_TOOLS.length);

      for (const t of tools) {
        expect(t.type).toBe("function");
        expect(typeof (t as any).function.name).toBe("string");
        expect(typeof (t as any).function.description).toBe("string");
        expect(typeof (t as any).function.parameters).toBe("object");
      }
    } finally {
      if (orig != null) {
        process.env.MCP_LOAD_TIMEOUT_MS = orig;
      } else {
        delete process.env.MCP_LOAD_TIMEOUT_MS;
      }
    }
  });

  it("BUILTIN_TOOL_NAMES and ALL_BUILTIN_TOOLS are in sync", () => {
    expect(BUILTIN_TOOL_NAMES.size).toBe(ALL_BUILTIN_TOOLS.length);
  });
});
