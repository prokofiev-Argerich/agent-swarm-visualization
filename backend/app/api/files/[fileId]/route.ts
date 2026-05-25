export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { deleteUploadedFile } from "@/lib/file-service";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const { fileId } = await params;
  const trimmedFileId = fileId?.trim();

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }
  if (!trimmedFileId) {
    return Response.json({ error: "Missing fileId" }, { status: 400 });
  }

  try {
    const file = await store.deleteFile({ fileId: trimmedFileId, workspaceId });
    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    await deleteUploadedFile(workspaceId, trimmedFileId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to delete file" },
      { status: 500 }
    );
  }
}
