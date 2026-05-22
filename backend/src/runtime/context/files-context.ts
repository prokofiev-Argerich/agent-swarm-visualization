import { store } from "@/lib/storage";
import type { UUID } from "../types";
import { MAX_FILES_IN_CONTEXT } from "@/lib/constants";

export async function buildFilesBlock(workspaceId: UUID): Promise<string> {
  try {
    const files = await store.listFilesByWorkspace(workspaceId);
    if (files.length === 0) return "";
    const lines = [
      "## Uploaded Files in this Workspace",
      "The following files have been uploaded to this workspace. To read any file, you MUST use the read_file tool with the fileId (never a filesystem path). Do NOT use bash or cat to read uploaded files.",
      "",
    ];
    for (const f of files.slice(0, MAX_FILES_IN_CONTEXT)) {
      lines.push(`- ${f.filename} (fileId: ${f.id}, size: ${f.size} bytes)`);
    }
    if (files.length > MAX_FILES_IN_CONTEXT) {
      lines.push(`\n... and ${files.length - MAX_FILES_IN_CONTEXT} more files (not shown).`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}
