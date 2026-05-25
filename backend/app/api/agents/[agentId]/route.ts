export const runtime = "nodejs";

import { getAgent, deleteAgent } from "@/services/agent-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const trimmedAgentId = agentId?.trim();
  if (!trimmedAgentId) {
    return Response.json({ error: "Missing agentId" }, { status: 400 });
  }

  const agent = await getAgent({ agentId: trimmedAgentId });
  return Response.json({
    agentId: agent.id,
    role: agent.role,
    llmHistory: agent.llmHistory,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const trimmedAgentId = agentId?.trim();
  if (!trimmedAgentId) {
    return Response.json({ error: "Missing agentId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    await deleteAgent({ agentId: trimmedAgentId, workspaceId });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to delete agent" },
      { status: 500 }
    );
  }
}
