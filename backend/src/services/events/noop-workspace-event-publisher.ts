import type { WorkspaceEventPublisher } from "./workspace-event-publisher";

export const noopWorkspaceEventPublisher: WorkspaceEventPublisher = {
  emit() {},
};
