export const runtime = "nodejs";

import { deleteGroup } from "@/services/group-service";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const trimmedGroupId = groupId?.trim();
  if (!trimmedGroupId) {
    return Response.json({ error: "Missing groupId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    await deleteGroup({ groupId: trimmedGroupId, workspaceId });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to delete group" },
      { status: 500 }
    );
  }
}
