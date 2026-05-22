import { describe, it, expect } from "vitest";
import { extractToolCallDeltas } from "./tool-call-deltas";

function makeState(toolCalls: Array<{ index: number; id?: string; name?: string; argumentsText: string }>) {
  return { toolCalls };
}

describe("extractToolCallDeltas", () => {
  it("returns empty array for chunks without tool_calls", () => {
    const deltas = extractToolCallDeltas({}, makeState([]), makeState([]));
    expect(deltas).toEqual([]);
  });

  it("returns empty array for empty tool_calls array", () => {
    const deltas = extractToolCallDeltas(
      { choices: [{ delta: { tool_calls: [] } }] },
      makeState([]),
      makeState([])
    );
    expect(deltas).toEqual([]);
  });

  it("emits delta for arguments chunk", () => {
    const prev = makeState([]);
    const next = makeState([{ index: 0, id: "call_1", name: "bash", argumentsText: '{"command":' }]);

    const deltas = extractToolCallDeltas(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "bash", arguments: '{"command":' },
                },
              ],
            },
          },
        ],
      },
      prev,
      next
    );

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe('{"command":');
    expect(deltas[0].tool_call_id).toBe("call_1");
    expect(deltas[0].tool_call_name).toBe("bash");
  });

  it("emits delta when tool name first appears (name revelation)", () => {
    const prev = makeState([]);
    const next = makeState([{ index: 0, id: "call_2", name: "read_file", argumentsText: "" }]);

    const deltas = extractToolCallDeltas(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_2",
                  function: { name: "read_file" },
                },
              ],
            },
          },
        ],
      },
      prev,
      next
    );

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe("");
    expect(deltas[0].tool_call_name).toBe("read_file");
  });

  it("does not emit duplicate name revelation", () => {
    const prev = makeState([{ index: 0, name: "read_file", argumentsText: "" }]);
    const next = makeState([{ index: 0, name: "read_file", argumentsText: '{"fileId":' }]);

    const deltas = extractToolCallDeltas(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"fileId":' },
                },
              ],
            },
          },
        ],
      },
      prev,
      next
    );

    // Only args delta, no name delta
    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe('{"fileId":');
  });

  it("handles multiple tool calls in one chunk", () => {
    const prev = makeState([]);
    const next = makeState([
      { index: 0, id: "c1", name: "bash", argumentsText: "ls" },
      { index: 1, id: "c2", name: "read_file", argumentsText: '{"fileId":' },
    ]);

    const deltas = extractToolCallDeltas(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: "ls" } },
                { index: 1, function: { name: "read_file", arguments: '{"fileId":' } },
              ],
            },
          },
        ],
      },
      prev,
      next
    );

    // Should get args for index 0, and name + args for index 1
    expect(deltas.length).toBeGreaterThanOrEqual(2);
  });

  it("handles undefined choices gracefully", () => {
    const deltas = extractToolCallDeltas(
      { choices: undefined },
      makeState([]),
      makeState([])
    );
    expect(deltas).toEqual([]);
  });
});
