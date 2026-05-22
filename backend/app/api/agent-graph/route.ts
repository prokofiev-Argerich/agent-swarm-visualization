export const runtime = "nodejs";

import { store } from "@/lib/storage";

type UUID = string;

type GraphNode = { id: UUID; role: string; parentId: UUID | null };
type GraphEdge = {
  fromAgentId: UUID;
  toAgentId: UUID;
  count: number;
  lastMessageId: UUID;
  lastMessageAt: string;
  sampleMessageIds: UUID[];
};

const SAMPLE_LIMIT = 5;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = (url.searchParams.get("workspaceId") ?? "").trim();
  const limitMessages = Number(url.searchParams.get("limitMessages") ?? "2000") || 2000;

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  const agents = await store.listAgentsMeta({ workspaceId });
  const recentMessages = await store.listRecentWorkspaceMessages({ workspaceId, limit: limitMessages });

  const messagesById = new Map<UUID, (typeof recentMessages)[number]>();
  for (const m of recentMessages) messagesById.set(m.id, m);

  // Aggregate causal edges: upstream.senderId -> downstream.senderId
  const edgeByKey = new Map<string, GraphEdge>();
  for (const m of recentMessages) {
    if (!m.causedBy) continue;
    const upstream = messagesById.get(m.causedBy);
    if (!upstream) continue;

    const from = upstream.senderId;
    const to = m.senderId;
    if (from === to) continue;

    const key = `${from}=>${to}`;
    const existing = edgeByKey.get(key);
    if (!existing) {
      edgeByKey.set(key, {
        fromAgentId: from,
        toAgentId: to,
        count: 1,
        lastMessageId: m.id,
        lastMessageAt: m.sendTime,
        sampleMessageIds: [m.id],
      });
    } else {
      existing.count += 1;
      if (m.sendTime > existing.lastMessageAt) {
        existing.lastMessageId = m.id;
        existing.lastMessageAt = m.sendTime;
      }
      if (existing.sampleMessageIds.length < SAMPLE_LIMIT) {
        existing.sampleMessageIds.push(m.id);
      }
    }
  }

  const nodes: GraphNode[] = agents.map((a) => ({
    id: a.id,
    role: a.role,
    parentId: a.parentId,
  }));

  const edges = [...edgeByKey.values()].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt)
  );

  return Response.json({
    nodes,
    edges,
    meta: {
      workspaceId,
      agents: agents.length,
      messagesConsidered: recentMessages.length,
      causalEdgesFound: edges.length,
    },
  });
}
