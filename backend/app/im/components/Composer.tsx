"use client";

import type { ChangeEvent, KeyboardEvent } from "react";

export function Composer({
  draft,
  onDraftChange,
  onSend,
  disabled,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="composer">
      <textarea
        className="input textarea"
        value={draft}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(e.target.value)}
        placeholder="Type a message… (Ctrl/Cmd+Enter to send)"
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void onSend();
          }
        }}
      />
      <button className="btn btn-primary" onClick={() => void onSend()} disabled={disabled}>
        Send
      </button>
    </div>
  );
}
