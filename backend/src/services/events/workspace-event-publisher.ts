export type WorkspaceId = string;

export type WorkspaceEventPayload = {
  event: string;
  data: Record<string, unknown>;
};

export interface WorkspaceEventPublisher {
  emit(workspaceId: WorkspaceId, event: WorkspaceEventPayload): void;
}

import { getWorkspaceUIBus } from "@/runtime/ui-bus";

export const workspaceEventPublisher: WorkspaceEventPublisher = {
  emit(workspaceId, event) {
    getWorkspaceUIBus().emit(workspaceId, event as any);
  },
};
