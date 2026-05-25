import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkspaceWithDefaults, deleteWorkspace, ensureWorkspaceDefaults, listWorkspaces } from "../workspace-service";

vi.mock("@/db", () => ({
  getDb: () => ({
    transaction: vi.fn((fn: any) => fn({
      insert: vi.fn(() => ({ values: vi.fn() })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => []) })) })) })),
    })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => [{ id: "ws-1" }]) })) })) })),
  }),
}));

vi.mock("@/lib/file-service", () => ({
  deleteWorkspaceUploads: vi.fn(),
}));

vi.mock("../events/workspace-event-publisher", () => ({
  workspaceEventPublisher: { emit: vi.fn() },
}));

vi.mock("@/lib/storage", () => ({
  store: {
    listWorkspaces: vi.fn(() => Promise.resolve([{ id: "ws-1", name: "Test", createdAt: new Date().toISOString() }])),
    deleteWorkspace: vi.fn(() => Promise.resolve()),
  },
}));

describe("workspace-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listWorkspaces returns workspaces", async () => {
    const result = await listWorkspaces();
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("id", "ws-1");
  });

  it("deleteWorkspace calls store and cleans uploads", async () => {
    const { deleteWorkspaceUploads } = await import("@/lib/file-service");
    await deleteWorkspace({ workspaceId: "ws-1" });
    expect(deleteWorkspaceUploads).toHaveBeenCalledWith("ws-1");
  });
});
