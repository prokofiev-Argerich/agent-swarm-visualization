import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { withSchemaRetry, type UUID } from "./shared";

export async function createFile(input: {
  id: UUID;
  workspaceId: UUID;
  filename: string;
  mimeType: string;
  size: number;
}) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const createdAt = new Date();
    await db.insert(files).values({
      id: input.id,
      workspaceId: input.workspaceId,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      createdAt,
    });
    return { id: input.id, createdAt: createdAt.toISOString() };
  });
}

export async function getFile(input: { fileId: UUID; workspaceId: UUID }) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const rows = await db.select().from(files).where(eq(files.id, input.fileId)).limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    if (r.workspaceId !== input.workspaceId) return null;
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      filename: r.filename,
      mimeType: r.mimeType,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function listFilesByWorkspace(workspaceId: UUID) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const rows = await db.select().from(files).where(eq(files.workspaceId, workspaceId)).orderBy(files.createdAt);
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      filename: r.filename,
      mimeType: r.mimeType,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function deleteFile(input: { fileId: UUID; workspaceId: UUID }) {
  return withSchemaRetry(async () => {
    const db = getDb();
    const file = await getFile(input);
    if (!file) return null;
    await db.delete(files).where(eq(files.id, input.fileId));
    return file;
  });
}
