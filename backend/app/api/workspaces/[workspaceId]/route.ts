export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { deleteWorkspaceUploads } from "@/lib/file-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const trimmedWorkspaceId = workspaceId?.trim();
  if (!trimmedWorkspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    await store.deleteWorkspace({ workspaceId: trimmedWorkspaceId });
    await deleteWorkspaceUploads(trimmedWorkspaceId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
