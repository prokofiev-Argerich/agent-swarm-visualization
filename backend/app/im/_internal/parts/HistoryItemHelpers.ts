export function summarizeHistoryEntry(entry: any, index: number, opts?: { omitRole?: boolean }) {
  const role = typeof entry?.role === "string" ? entry.role : "unknown";
  const toolCalls = Array.isArray(entry?.tool_calls) ? entry.tool_calls.length : 0;
  const toolName =
    typeof entry?.name === "string"
      ? entry.name
      : typeof entry?.tool_call_id === "string"
        ? entry.tool_call_id.slice(0, 6)
        : "";
  let contentText = "";
  if (typeof entry?.content === "string") {
    contentText = entry.content;
  } else if (entry?.content != null) {
    try {
      contentText = JSON.stringify(entry.content);
    } catch {
      contentText = String(entry.content);
    }
  }
  contentText = contentText.replace(/\s+/g, " ").slice(0, 80);
  const metaParts: string[] = [];
  if (!opts?.omitRole) metaParts.push(role);
  if (role === "tool" && toolName) {
    metaParts.push(toolName);
  } else if (toolCalls > 0) {
    metaParts.push(`tool_calls:${toolCalls}`);
  }
  const meta = metaParts.join(" · ");
  const prefix = meta ? `#${index + 1} ${meta}` : `#${index + 1}`;
  return contentText ? `${prefix} — ${contentText}` : prefix;
}

export function historyRole(entry: any) {
  return typeof entry?.role === "string" ? entry.role : "unknown";
}

export function historyAccent(role?: string) {
  if (!role) return "#94a3b8";
  if (role === "human") return "#f8fafc";
  if (role === "assistant") return "#38bdf8";
  if (role === "productmanager") return "#fb7185";
  if (role === "coder") return "#34d399";
  if (role === "tool") return "#fbbf24";
  if (role === "system") return "#a78bfa";
  return "#94a3b8";
}
