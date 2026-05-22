import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { store } from "@/lib/storage";
import { writeUploadedFile } from "@/lib/file-service";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE, MAX_FILE_CONTENT_CHARS } from "@/lib/constants";
import { getWorkspaceUIBus } from "../ui-bus";
import { parseArgs, requireParam, requireUuid } from "./validate";
import type { RuntimeTool } from "./types";

export const fileTools: RuntimeTool[] = [
  {
    name: "read_file",
    definition: {
      type: "function",
      function: {
        name: "read_file",
        description:
          "Read the contents of a file that was uploaded to the workspace. Accepts a fileId (returned by upload), never a filesystem path. Returns {filename, content, truncated}. Only files within the current workspace are accessible.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            fileId: { type: "string", description: "The fileId returned by the upload API" },
          },
          required: ["fileId"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ fileId?: string }>(call.argumentsText);
      const fileId = (args.fileId ?? "").trim();
      const missing = requireParam(fileId, "fileId");
      if (missing) return missing;
      const notUuid = requireUuid(fileId, "fileId",
        "Use a fileId from the workspace's Uploaded Files list, never a filename or path. For source files, use the bash tool to cat them.");
      if (notUuid) return notUuid;

      const fileMeta = await store.getFile({ fileId, workspaceId: context.workspaceId });
      if (!fileMeta) {
        return { ok: false, error: "File not found or not accessible in this workspace" };
      }

      const uploadDir = path.join(process.cwd(), "data", "uploads", context.workspaceId);
      const filePath = path.join(uploadDir, fileId);
      const resolvedPath = path.resolve(filePath);
      const resolvedUploadDir = path.resolve(uploadDir);
      if (!resolvedPath.startsWith(resolvedUploadDir)) {
        return { ok: false, error: "Invalid fileId" };
      }

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const truncated = content.length > MAX_FILE_CONTENT_CHARS;
        const resultContent = truncated ? content.slice(0, MAX_FILE_CONTENT_CHARS) : content;
        getWorkspaceUIBus().emit(context.workspaceId, {
          event: "ui.agent.file.read",
          data: {
            workspaceId: context.workspaceId,
            agentId: context.agentId,
            fileId,
            filename: fileMeta.filename,
            truncated,
          },
        });
        return { ok: true, filename: fileMeta.filename, content: resultContent, truncated, totalBytes: fileMeta.size };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed to read file" };
      }
    },
  },
  {
    name: "write_file",
    definition: {
      type: "function",
      function: {
        name: "write_file",
        description:
          "Write a text file to the current workspace and register it so it appears in the file list. Use this to publish reports, summaries, or other deliverables that humans should be able to download. Returns {fileId, filename}. Allowed extensions: .md, .txt, .json, .csv. Max 2MB.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            filename: {
              type: "string",
              description: "Filename including extension, e.g. 'competitor-analysis.md'",
            },
            content: {
              type: "string",
              description: "Full text content to write. UTF-8.",
            },
          },
          required: ["filename", "content"],
        },
      },
    },
    async execute(call, context) {
      const args = parseArgs<{ filename?: string; content?: string }>(call.argumentsText);
      const rawFilename = (args.filename ?? "").trim();
      const content = args.content ?? "";

      const missing = requireParam(rawFilename, "filename");
      if (missing) return missing;

      if (rawFilename.includes("/") || rawFilename.includes("\\") || rawFilename.includes("..")) {
        return { ok: false, error: "filename must not contain path separators or '..'" };
      }
      const ext = rawFilename.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
        return {
          ok: false,
          error: `Extension '.${ext}' not allowed. Allowed: ${[...ALLOWED_FILE_EXTENSIONS].map((e) => "." + e).join(", ")}`,
        };
      }

      const buffer = Buffer.from(content, "utf-8");
      if (buffer.byteLength > MAX_FILE_SIZE) {
        return {
          ok: false,
          error: `File size ${buffer.byteLength} bytes exceeds limit ${MAX_FILE_SIZE} bytes`,
        };
      }

      const mimeType =
        ext === "md"
          ? "text/markdown"
          : ext === "json"
            ? "application/json"
            : ext === "csv"
              ? "text/csv"
              : "text/plain";

      const fileId = randomUUID();
      try {
        await writeUploadedFile(context.workspaceId, fileId, buffer);
        await store.createFile({
          id: fileId,
          workspaceId: context.workspaceId,
          filename: rawFilename,
          mimeType,
          size: buffer.byteLength,
        });
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Failed to write file",
        };
      }

      getWorkspaceUIBus().emit(context.workspaceId, {
        event: "ui.db.write",
        data: {
          workspaceId: context.workspaceId,
          table: "files",
          action: "insert",
          recordId: fileId,
        },
      });

      return {
        ok: true,
        fileId,
        filename: rawFilename,
        size: buffer.byteLength,
      };
    },
  },
];
