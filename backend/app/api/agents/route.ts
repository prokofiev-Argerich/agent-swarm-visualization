export const runtime = "nodejs";

import { listAgentsMeta, listAgents, createSubAgentWithP2P } from "@/services/agent-service";
import { ensureWorkspaceDefaults } from "@/services/workspace-service";
import { getAgentRuntime } from "@/runtime/agent-runtime";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const meta = url.searchParams.get("meta") === "true";

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  if (meta) {
    const agents = await listAgentsMeta({ workspaceId });
    return Response.json({ agents });
  }

  const agents = await listAgents({ workspaceId });
  return Response.json({ agents });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        workspaceId?: string;
        creatorId?: string;
        role?: string;
        groupId?: string;
      }
    | null;

  const workspaceId = body?.workspaceId?.trim();
  const creatorId = body?.creatorId?.trim();
  const role = body?.role?.trim();

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }
  if (!creatorId) {
    return Response.json({ error: "Missing creatorId" }, { status: 400 });
  }
  if (!role) {
    return Response.json({ error: "Missing role" }, { status: 400 });
  }

  const runtime = getAgentRuntime();
  await runtime.bootstrap();
  await ensureWorkspaceDefaults({ workspaceId });

  const collaborationGroupId = body?.groupId?.trim() || undefined;

  const created = await createSubAgentWithP2P({
    workspaceId,
    creatorId,
    role,
    collaborationGroupId,
  });
  runtime.ensureRunner(created.agentId);

  return Response.json(
    {
      agentId: created.agentId,
      groupId: created.groupId,
      collaborationGroupId: created.collaborationGroupId,
      createdAt: created.createdAt,
    },
    { status: 201 }
  );
}
