export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { readUploadedFile } from "@/lib/file-service";
import { z } from "zod";

const MAX_CONTENT_CHARS = 100_000;

const QuerySchema = z.object({
  fileId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId")?.trim() ?? "";
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";

  const parsed = QuerySchema.safeParse({ fileId, workspaceId });
  if (!parsed.success) {
    return Response.json(
      { error: "Missing or invalid fileId / workspaceId" },
      { status: 400 }
    );
  }

  const fileMeta = await store.getFile({
    fileId: parsed.data.fileId,
    workspaceId: parsed.data.workspaceId,
  });
  if (!fileMeta) {
    return Response.json(
      { error: "File not found or not accessible in this workspace" },
      { status: 404 }
    );
  }

  try {
    const buffer = await readUploadedFile(parsed.data.workspaceId, parsed.data.fileId);
    const text = buffer.toString("utf-8");
    const truncated = text.length > MAX_CONTENT_CHARS;
    const content = truncated ? text.slice(0, MAX_CONTENT_CHARS) : text;
    return Response.json({
      fileId: fileMeta.id,
      filename: fileMeta.filename,
      mimeType: fileMeta.mimeType,
      size: fileMeta.size,
      content,
      truncated,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to read file" },
      { status: 500 }
    );
  }
}
