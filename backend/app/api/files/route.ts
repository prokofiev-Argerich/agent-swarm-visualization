export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { z } from "zod";

const ListSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";

  const parsed = ListSchema.safeParse({ workspaceId });
  if (!parsed.success) {
    return Response.json({ error: "Missing or invalid workspaceId" }, { status: 400 });
  }

  try {
    const files = await store.listFilesByWorkspace(parsed.data.workspaceId);
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
    console.error("[api/files] listFilesByWorkspace failed", e);
    const cause = (e as { cause?: { message?: string; code?: string } })?.cause;
    const detail =
      cause?.message ??
      (e instanceof Error ? e.message : "Failed to list files");
    const code = cause?.code;
    return Response.json(
      {
        error: detail,
        ...(code ? { code } : {}),
      },
      { status: 500 }
    );
  }
}
