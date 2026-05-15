export const runtime = "nodejs";

import { store } from "@/lib/storage";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";

  if (!workspaceId) {
    return Response.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    const files = await store.listFilesByWorkspace(workspaceId);
    return Response.json({
      files: files.map((f) => ({
        fileId: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
      })),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list files" },
      { status: 500 }
    );
  }
}
