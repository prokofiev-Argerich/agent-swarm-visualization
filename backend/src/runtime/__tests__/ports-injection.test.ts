import { describe, it, expect } from "vitest";
import type { RuntimeEventSink, RuntimeLogger } from "../ports";

describe("Runtime ports injection", () => {
  it("fake event sink can collect emitted events", () => {
    const events: Array<{ workspaceId: string; event: string; data: unknown }> = [];
    const fakeSink: RuntimeEventSink = {
      emit(event) {
        events.push(event);
      },
    };

    fakeSink.emit({ workspaceId: "ws-1", event: "ui.test", data: { foo: 1 } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ workspaceId: "ws-1", event: "ui.test", data: { foo: 1 } });
  });

  it("fake logger can collect stream and history calls", () => {
    const streams: Array<Parameters<RuntimeLogger["stream"]>[0]> = [];
    const snapshots: Array<Parameters<RuntimeLogger["historySnapshot"]>[0]> = [];
    const fakeLogger: RuntimeLogger = {
      stream(input) {
        streams.push(input);
      },
      historySnapshot(input) {
        snapshots.push(input);
      },
    };

    fakeLogger.stream({ agentId: "a1", kind: "tool_result", delta: "{}" });
    fakeLogger.historySnapshot({ agentId: "a1", workspaceId: "ws-1", groupId: "g1", history: [] });

    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ agentId: "a1", kind: "tool_result" });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ agentId: "a1", workspaceId: "ws-1" });
  });
});
