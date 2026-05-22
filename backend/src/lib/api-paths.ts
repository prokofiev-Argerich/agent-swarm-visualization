// Centralized API path builders. Frontend code must use these instead of
// hardcoding URLs. Flat paths are used as the primary routes because Next.js
// dev server (Turbopack) currently has known issues compiling nested-dynamic
// route handlers like `/api/workspaces/[id]/defaults`. The flat variants
// (`/api/workspace-defaults?workspaceId=...`) are always compiled correctly.
//
// Nested routes remain available as compat aliases for production.

function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === false) continue;
    qs.set(k, String(v));
  }
  const suffix = qs.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export const apiPaths = {
  workspaces: () => "/api/workspaces",
  workspace: (workspaceId: string) =>
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
  workspaceDefaults: (workspaceId: string) =>
    withQuery("/api/workspace-defaults", { workspaceId }),

  agentContextStream: (agentId: string, opts?: { groupId?: string }) =>
    withQuery("/api/agent-context-stream", { agentId, groupId: opts?.groupId }),

  groupMessages: (
    groupId: string,
    opts?: {
      markRead?: boolean;
      readerId?: string;
      limit?: number;
      before?: string;
      phaseId?: string;
    }
  ) =>
    withQuery("/api/group-messages", {
      groupId,
      markRead: opts?.markRead,
      readerId: opts?.readerId,
      limit: opts?.limit,
      before: opts?.before,
      phaseId: opts?.phaseId,
    }),

  phaseSummaries: (groupId: string) =>
    withQuery("/api/phase-summaries", { groupId }),

  fileContent: (fileId: string, workspaceId: string) =>
    withQuery("/api/file-content", { fileId, workspaceId }),

  search: (workspaceId: string, q: string, opts?: { agentId?: string; limit?: number }) =>
    withQuery("/api/search", {
      workspaceId,
      q,
      agentId: opts?.agentId,
      limit: opts?.limit,
    }),

  messagesByIds: (workspaceId: string, ids: string[]) =>
    withQuery("/api/messages-by-ids", { workspaceId, ids: ids.join(",") }),

  groupMessagesNested: (
    groupId: string,
    opts?: {
      markRead?: boolean;
      readerId?: string;
      limit?: number;
      before?: string;
      phaseId?: string;
    }
  ) =>
    withQuery(`/api/groups/${encodeURIComponent(groupId)}/messages`, {
      markRead: opts?.markRead,
      readerId: opts?.readerId,
      limit: opts?.limit,
      before: opts?.before,
      phaseId: opts?.phaseId,
    }),
};
