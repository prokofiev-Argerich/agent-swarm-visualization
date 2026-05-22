"use client";

import type { ChangeEvent, RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, FileText, Plus } from "lucide-react";

import { apiPaths } from "@/lib/api-paths";
import { HUD } from "./uiTokens";

type FileItem = {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type FileContentResponse = {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  truncated: boolean;
  error?: string;
};

const ICON_BTN_STYLE = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  width: 22,
  height: 22,
  background: "transparent",
  border: `1px solid ${HUD.panelBorder}`,
  borderRadius: 4,
  color: HUD.textMuted,
  cursor: "pointer" as const,
  transition: HUD.hoverTransition,
};

export function FilePanel({
  files,
  workspaceId,
  showFilesPanel,
  onTogglePanel,
  onUploadClick,
  fileInputRef,
  onFileInputChange,
  onInsertFile,
}: {
  files: FileItem[];
  workspaceId: string;
  showFilesPanel: boolean;
  onTogglePanel: () => void;
  onUploadClick: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onInsertFile: (file: FileItem) => void;
}) {
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const togglePreview = useCallback(
    async (file: FileItem) => {
      if (previewFileId === file.fileId) {
        setPreviewFileId(null);
        setPreviewContent("");
        setPreviewError(null);
        return;
      }
      setPreviewFileId(file.fileId);
      setPreviewContent("");
      setPreviewError(null);
      setPreviewLoading(true);
      try {
        const res = await fetch(apiPaths.fileContent(file.fileId, workspaceId));
        const json = (await res.json()) as FileContentResponse;
        if (!res.ok) {
          setPreviewError(json.error ?? `${res.status}`);
        } else {
          setPreviewContent(json.content);
          setPreviewTruncated(json.truncated);
        }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setPreviewLoading(false);
      }
    },
    [previewFileId, workspaceId]
  );

  // Reset preview when file disappears
  useEffect(() => {
    if (previewFileId && !files.some((f) => f.fileId === previewFileId)) {
      setPreviewFileId(null);
      setPreviewContent("");
    }
  }, [files, previewFileId]);

  return (
    <div
      style={{
        borderTop: `1px solid ${HUD.panelBorder}`,
        padding: "10px 12px",
        flexShrink: 0,
        maxHeight: 360,
        overflow: "auto",
        background: "rgba(255,255,255,0.60)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: HUD.labelLetterSpacing,
            textTransform: "uppercase",
            color: HUD.accentCyan,
          }}
        >
          <FileText size={12} strokeWidth={2.2} />
          Files
          {files.length > 0 && (
            <span style={{ color: HUD.textDim, fontFamily: "ui-monospace, monospace", fontWeight: 400 }}>
              · {files.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onUploadClick}
            title="Upload file"
            style={ICON_BTN_STYLE}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = HUD.accentCyan;
              e.currentTarget.style.borderColor = HUD.panelBorderStrong;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = HUD.textMuted;
              e.currentTarget.style.borderColor = HUD.panelBorder;
            }}
          >
            <Plus size={13} strokeWidth={2.2} />
          </button>
          <button
            onClick={onTogglePanel}
            title={showFilesPanel ? "Collapse" : "Expand"}
            style={ICON_BTN_STYLE}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = HUD.accentCyan;
              e.currentTarget.style.borderColor = HUD.panelBorderStrong;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = HUD.textMuted;
              e.currentTarget.style.borderColor = HUD.panelBorder;
            }}
          >
            {showFilesPanel ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.json,.csv"
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />
      {showFilesPanel && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {files.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: HUD.textDim,
                padding: "8px 4px",
                fontFamily: "ui-monospace, monospace",
                letterSpacing: "0.02em",
              }}
            >
              — no files —
            </div>
          ) : (
            files.map((f) => {
              const isOpen = previewFileId === f.fileId;
              return (
                <div key={f.fileId} style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 11,
                      color: HUD.textPrimary,
                      border: `1px solid transparent`,
                      transition: HUD.hoverTransition,
                    }}
                    onClick={() => onInsertFile(f)}
                    title="Click to insert read_file() into the message draft"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(34,211,238,0.05)";
                      e.currentTarget.style.borderColor = `${HUD.accentCyan}22`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <FileText size={11} strokeWidth={2.0} color={HUD.textMuted} />
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.filename}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: HUD.textDim,
                        whiteSpace: "nowrap",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {(f.size / 1024).toFixed(1)}KB
                    </span>
                    <button
                      style={ICON_BTN_STYLE}
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePreview(f);
                      }}
                      title={isOpen ? "Hide preview" : "Preview content"}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = HUD.accentCyan;
                        e.currentTarget.style.borderColor = HUD.panelBorderStrong;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = HUD.textMuted;
                        e.currentTarget.style.borderColor = HUD.panelBorder;
                      }}
                    >
                      {isOpen ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      style={ICON_BTN_STYLE}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(f.fileId).catch(() => {});
                      }}
                      title="Copy fileId"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = HUD.accentCyan;
                        e.currentTarget.style.borderColor = HUD.panelBorderStrong;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = HUD.textMuted;
                        e.currentTarget.style.borderColor = HUD.panelBorder;
                      }}
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        margin: "4px 4px 6px",
                        padding: "8px 10px",
                        border: `1px solid ${HUD.panelBorder}`,
                        borderRadius: 4,
                        background: HUD.panelBgOpaque,
                        fontSize: 11,
                        color: HUD.textSecondary,
                        maxHeight: 220,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {previewLoading ? (
                        <span style={{ color: HUD.textDim }}>Loading…</span>
                      ) : previewError ? (
                        <span style={{ color: HUD.accentRed }}>Error: {previewError}</span>
                      ) : (
                        <>
                          {previewContent || <span style={{ color: HUD.textDim }}>(empty)</span>}
                          {previewTruncated && (
                            <div
                              style={{
                                color: HUD.textDim,
                                marginTop: 6,
                                fontSize: 10,
                                letterSpacing: "0.04em",
                              }}
                            >
                              … (truncated at 100KB)
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
