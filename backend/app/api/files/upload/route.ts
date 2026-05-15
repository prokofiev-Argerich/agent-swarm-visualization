export const runtime = "nodejs";

import { promises as fs } from "node:fs";
import path from "node:path";
import { store } from "@/lib/storage";

const ALLOWED_EXTENSIONS = new Set(["md", "txt", "json", "csv"]);
const EXT_TO_MIME: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

function getUploadDir(): string {
  return path.join(process.cwd(), "data", "uploads");
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  try {
    const formData = await req.formData();
    workspaceId = (formData.get("workspaceId") as string | null)?.trim() ?? null;
    const file = formData.get("file") as File | null;

    if (!workspaceId) {
      return Response.json({ error: "Missing workspaceId" }, { status: 400 });
    }
    if (!file) {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }

    // Verify workspace exists
    const workspaces = await store.listWorkspaces();
    if (!workspaces.some((w) => w.id === workspaceId)) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const filename = file.name;
    const ext = getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json(
        { error: `Invalid file type. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}` },
        { status: 400 }
      );
    }

    const fileSize = file.size;
    if (fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 413 });
    }
    if (fileSize === 0) {
      return Response.json({ error: "Empty file" }, { status: 400 });
    }

    const mimeType = (EXT_TO_MIME[ext] ?? file.type) || "application/octet-stream";

    const fileId = crypto.randomUUID();
    const uploadDir = path.join(getUploadDir(), workspaceId);
    await fs.mkdir(uploadDir, { recursive: true });

    const tempPath = path.join(uploadDir, `${fileId}.tmp`);
    const finalPath = path.join(uploadDir, fileId);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, finalPath);

    try {
      await store.createFile({
        id: fileId,
        workspaceId,
        filename,
        mimeType,
        size: fileSize,
      });
    } catch (dbErr) {
      await fs.unlink(finalPath).catch(() => {});
      throw dbErr;
    }

    return Response.json(
      {
        fileId,
        filename,
        mimeType,
        size: fileSize,
        workspaceId,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
