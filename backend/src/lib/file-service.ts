import { promises as fs } from "node:fs";
import path from "node:path";

function getUploadDir(): string {
  return path.join(process.cwd(), "data", "uploads");
}

export async function writeUploadedFile(
  workspaceId: string,
  fileId: string,
  buffer: Buffer
): Promise<void> {
  const uploadDir = path.join(getUploadDir(), workspaceId);
  await fs.mkdir(uploadDir, { recursive: true });

  const tempPath = path.join(uploadDir, `${fileId}.tmp`);
  const finalPath = path.join(uploadDir, fileId);

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, finalPath);
}

export async function readUploadedFile(
  workspaceId: string,
  fileId: string
): Promise<Buffer> {
  const filePath = path.join(getUploadDir(), workspaceId, fileId);
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(getUploadDir());

  if (!resolvedPath.startsWith(resolvedUploadDir)) {
    throw new Error("Invalid file path");
  }

  return fs.readFile(resolvedPath);
}

export async function deleteWorkspaceUploads(workspaceId: string): Promise<void> {
  const uploadDir = path.join(getUploadDir(), workspaceId);
  await fs.rm(uploadDir, { recursive: true, force: true });
}

export async function deleteUploadedFile(
  workspaceId: string,
  fileId: string
): Promise<void> {
  const filePath = path.join(getUploadDir(), workspaceId, fileId);
  await fs.unlink(filePath).catch(() => {
    // ignore missing files
  });
}
