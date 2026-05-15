"use client";

import type { ChangeEvent, RefObject } from "react";

type FileItem = {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export function FilePanel({
  files,
  showFilesPanel,
  onTogglePanel,
  onUploadClick,
  fileInputRef,
  onFileInputChange,
  onInsertFile,
}: {
  files: FileItem[];
  showFilesPanel: boolean;
  onTogglePanel: () => void;
  onUploadClick: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onInsertFile: (file: FileItem) => void;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid #27272a",
        padding: "10px 12px",
        flexShrink: 0,
        maxHeight: 240,
        overflow: "auto",
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
        <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa" }}>Files</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={onUploadClick}
            title="上传文件"
          >
            +
          </button>
          <button
            className="btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={onTogglePanel}
          >
            {showFilesPanel ? "−" : "+"}
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
            <div className="muted" style={{ fontSize: 11, padding: "4px 0" }}>
              暂无文件
            </div>
          ) : (
            files.map((f) => (
              <div
                key={f.fileId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#e4e4e7",
                }}
                className="file-row"
                onClick={() => onInsertFile(f)}
                title="点击插入 read_file 到输入框"
              >
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
                <span className="muted" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                  {(f.size / 1024).toFixed(1)}KB
                </span>
                <button
                  className="btn"
                  style={{ padding: "1px 4px", fontSize: 10 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(f.fileId).catch(() => {});
                  }}
                  title="复制 fileId"
                >
                  ID
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
