// Centralized API path builders. Frontend code must use these instead of
// hardcoding URLs. Flat paths are used as the primary routes because Next.js
// dev server (Turbopack) currently has known issues compiling nested-dynamic
// route handlers like `/api/workspaces/[id]/defaults`. The flat variants
// (`/api/workspace-defaults?workspaceId=...`) are always compiled correctly.
//
// Nested routes remain available as compat aliases for production.

function withQuery(path: string, params: Record<string, string | boolean | undefined | null>): string {
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
    opts?: { markRead?: boolean; readerId?: string }
  ) =>
    withQuery("/api/group-messages", {
      groupId,
      markRead: opts?.markRead,
      readerId: opts?.readerId,
    }),
};
