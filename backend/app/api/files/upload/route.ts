export const runtime = "nodejs";

import { store } from "@/lib/storage";
import { writeUploadedFile } from "@/lib/file-service";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";
import { z } from "zod";

const EXT_TO_MIME: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

const UploadSchema = z.object({
  workspaceId: z.string().uuid(),
  file: z.instanceof(File).refine((f) => f.size > 0, "Empty file"),
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const workspaceId = (formData.get("workspaceId") as string | null)?.trim() ?? "";
    const file = formData.get("file") as File | null;

    const parsed = UploadSchema.safeParse({ workspaceId, file });
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });
    }

    const validWorkspaceId = parsed.data.workspaceId;

    const workspaces = await store.listWorkspaces();
    if (!workspaces.some((w) => w.id === validWorkspaceId)) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const filename = file!.name;
    const ext = getExtension(filename);
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
      return Response.json(
        { error: `Invalid file type. Allowed: ${Array.from(ALLOWED_FILE_EXTENSIONS).join(", ")}` },
        { status: 400 }
      );
    }

    const fileSize = file!.size;
    if (fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 413 });
    }

    const mimeType = (EXT_TO_MIME[ext] ?? file!.type) || "application/octet-stream";
    const fileId = crypto.randomUUID();
    const buffer = Buffer.from(await file!.arrayBuffer());

    await writeUploadedFile(validWorkspaceId, fileId, buffer);

    try {
      await store.createFile({
        id: fileId,
        workspaceId: validWorkspaceId,
        filename,
        mimeType,
        size: fileSize,
      });
    } catch (dbErr) {
      const { deleteUploadedFile } = await import("@/lib/file-service");
      await deleteUploadedFile(validWorkspaceId, fileId);
      throw dbErr;
    }

    return Response.json(
      { fileId, filename, mimeType, size: fileSize, workspaceId: validWorkspaceId },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
