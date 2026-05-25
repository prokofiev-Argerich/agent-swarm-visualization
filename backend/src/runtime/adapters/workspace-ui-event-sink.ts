import { getWorkspaceUIBus } from "@/runtime/ui-bus";
import type { RuntimeEventSink, RuntimeUIEvent } from "../ports";

export const workspaceUIEventSink: RuntimeEventSink = {
  emit(event: RuntimeUIEvent) {
    getWorkspaceUIBus().emit(event.workspaceId, {
      event: event.event,
      data: event.data,
    } as any);
  },
};
