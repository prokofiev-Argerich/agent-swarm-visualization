export const runtime = "nodejs";

import { store } from "@/lib/storage";

type UUID = string;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = (url.searchParams.get("workspaceId") ?? "").trim();
  const agentId = (url.searchParams.get("agentId") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const qLower = q.toLowerCase();
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? "20") || 20));

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  const agents = await store.listAgentsMeta({ workspaceId });
  const agentResults = agents
    .filter((a) => a.id && a.role)
    .filter((a) => {
      if (!qLower) return true;
      return a.role.toLowerCase().includes(qLower) || a.id.toLowerCase().includes(qLower);
    })
    .slice(0, limit)
    .map((a) => ({ id: a.id as UUID, role: a.role, parentId: a.parentId, createdAt: a.createdAt }));

  const agentRoleById = new Map(agents.map((a) => [a.id as UUID, a.role]));
  const groups = await store.listGroups({
    workspaceId,
    agentId: agentId || undefined,
  });
  const groupResults = groups
    .filter((g) => {
      if (!qLower) return true;
      const nameMatch = (g.name ?? "").toLowerCase().includes(qLower);
      const idMatch = g.id.toLowerCase().includes(qLower);
      const memberMatch = g.memberIds.some((id) =>
        (agentRoleById.get(id) ?? id).toLowerCase().includes(qLower)
      );
      return nameMatch || idMatch || memberMatch;
    })
    .slice(0, limit);

  // Message content search (only when q is non-empty)
  const messageResults = q
    ? (await store.searchMessages({ workspaceId, query: q, limit })).map((m) => ({
        ...m,
        senderRole: agentRoleById.get(m.senderId) ?? null,
      }))
    : [];

  return Response.json({
    agents: agentResults,
    groups: groupResults,
    messages: messageResults,
  });
}
