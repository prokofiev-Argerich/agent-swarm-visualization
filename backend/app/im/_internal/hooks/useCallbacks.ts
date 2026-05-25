"use client";

import type { ChangeEvent } from "react";
import { useCallback } from "react";
import { apiPaths } from "@/lib/api-paths";
import { SESSION_KEY } from "@/lib/constants";
import type { AgentStatus } from "@/lib/agent-status";
import { api } from "../utils";
import type { AgentMeta, FileItem, Group, Message } from "../types";

export function useCallbacks(args: {
  session: { workspaceId: string; humanAgentId: string; assistantAgentId: string; defaultGroupId: string } | null;
  activeGroupId: string | null;
  groups: Group[];
  agents: AgentMeta[];
  stoppingAgents: boolean;
  draft: string;
  setError: (e: string | null) => void;
  setAgentError: (e: string | null) => void;
  setStatus: (s: "boot" | "groups" | "messages" | "send" | "idle") => void;
  setActiveGroupId: (id: string | null) => void;
  setAgents: React.Dispatch<React.SetStateAction<AgentMeta[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setAgentStatusById: React.Dispatch<React.SetStateAction<Record<string, AgentStatus>>>;
  setStoppingAgents: React.Dispatch<React.SetStateAction<boolean>>;
  refreshGroups: (s: any, opts?: any) => Promise<void>;
  refreshAgents: (s: any) => Promise<void>;
  refreshFiles: (s: any) => Promise<void>;
  connectAgentStream: (id: string) => void;
  agentRoleById: Map<string, string>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    session, activeGroupId, groups, agents, stoppingAgents, draft,
    setError, setAgentError, setStatus, setActiveGroupId, setAgents, setGroups, setMessages, setDraft,
    setAgentStatusById, setStoppingAgents,
    refreshGroups, refreshAgents, refreshFiles, connectAgentStream, agentRoleById, bottomRef,
  } = args;

  const getGroupLabel = useCallback((g: Group | null | undefined) => {
    if (!g) return "Group";
    if (g.name) return g.name;
    if (g.id === session?.defaultGroupId) return "P2P 人类↔助手";
    const memberRoles = g.memberIds.filter((id) => id !== session?.humanAgentId).map((id) => agentRoleById.get(id) ?? id.slice(0, 8));
    if (memberRoles.length === 1) return `P2P 人类↔${memberRoles[0]}`;
    if (memberRoles.length === 2) return `${memberRoles[0]} ↔ ${memberRoles[1]}`;
    if (memberRoles.length > 2) return `Group (${memberRoles.length})`;
    return "Group";
  }, [agentRoleById, session?.defaultGroupId, session?.humanAgentId]);

  const deleteAgent = useCallback(async (agentId: string, workspaceId: string) => {
    if (!confirm("确定要删除这个 Agent 吗？关联的群组也会被删除。")) return;
    await api(`/api/agents/${encodeURIComponent(agentId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    setGroups((prev) => prev.filter((g) => !g.memberIds.includes(agentId)));
    if (activeGroupId && groups.find((g) => g.id === activeGroupId)?.memberIds.includes(agentId)) setActiveGroupId(null);
  }, [activeGroupId, groups, setAgents, setGroups, setActiveGroupId]);

  const deleteGroup = useCallback(async (groupId: string, workspaceId: string) => {
    if (!confirm("确定要删除这个群组吗？群组内的所有消息也会被删除。")) return;
    await api(`/api/groups/${encodeURIComponent(groupId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (activeGroupId === groupId) { setActiveGroupId(null); setMessages([]); }
  }, [activeGroupId, setGroups, setMessages, setActiveGroupId]);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    if (!confirm("⚠️ 确定要删除整个 Workspace 吗？所有 Agent、群组和消息都会被永久删除！")) return;
    await api(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
    localStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    if (!session) return;
    const formData = new FormData();
    formData.append("workspaceId", session.workspaceId);
    formData.append("file", file);
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(`${res.status} ${text}`); }
      await refreshFiles(session);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [session, refreshFiles, setError]);

  const onFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  }, [uploadFile]);

  const insertFileToDraft = useCallback((file: FileItem) => {
    const text = `read_file({ fileId: "${file.fileId}" })`;
    setDraft((prev) => (prev ? prev + "\n" + text : text));
  }, [setDraft]);

  const hireSubAgent = useCallback(async () => {
    if (!session) return;
    const role = (window.prompt("Sub-agent role", "assistant") ?? "").trim();
    if (!role) return;
    setError(null); setAgentError(null); setStatus("boot");
    try {
      const created = await api<{ agentId: string; groupId: string }>(`/api/agents`, { method: "POST", body: JSON.stringify({ workspaceId: session.workspaceId, creatorId: session.humanAgentId, role }) });
      setStatus("idle");
      void refreshGroups(session); void refreshAgents(session);
      setActiveGroupId(created.groupId);
      connectAgentStream(created.agentId);
    } catch (e) { setStatus("idle"); setError(e instanceof Error ? e.message : String(e)); }
  }, [session, connectAgentStream, refreshGroups, refreshAgents, setAgentError, setError, setStatus, setActiveGroupId]);

  const onInterruptAllAgents = useCallback(async () => {
    if (!session || stoppingAgents) return;
    setStoppingAgents(true); setError(null); setAgentError(null);
    try {
      const res = await api<{ ok: boolean; interrupted: number; agentIds: string[] }>(`/api/agents/interrupt-all`, { method: "POST", body: JSON.stringify({ workspaceId: session.workspaceId }) });
      setAgentStatusById((prev) => {
        const next = { ...prev };
        const ids = res.agentIds.length > 0 ? res.agentIds : agents.map((a) => a.id);
        for (const id of ids) next[id] = "IDLE";
        return next;
      });
      setStatus("idle");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setStoppingAgents(false); }
  }, [agents, session, stoppingAgents, setAgentError, setError, setStatus, setAgentStatusById, setStoppingAgents]);

  const onSend = useCallback(async () => {
    if (!session || !activeGroupId) return;
    const text = draft.trim();
    if (!text) return;
    if (text.startsWith("/create") || text.startsWith("/hire")) {
      const role = text.replace(/^\/(create|hire)\s*/i, "").trim();
      if (!role) { setError("Usage: /create <role>"); return; }
      setStatus("boot"); setError(null);
      try {
        const created = await api<{ agentId: string; groupId: string }>(`/api/agents`, { method: "POST", body: JSON.stringify({ workspaceId: session.workspaceId, creatorId: session.humanAgentId, role }) });
        setDraft(""); setStatus("idle");
        void refreshGroups(session); void refreshAgents(session);
        setActiveGroupId(created.groupId);
        connectAgentStream(created.agentId);
        return;
      } catch (e) { setStatus("idle"); setError(e instanceof Error ? e.message : String(e)); return; }
    }
    setStatus("send"); setError(null);
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = { id: optimisticId, senderId: session.humanAgentId, content: text, contentType: "text", sendTime: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    try {
      const result = await api<{ id: string; sendTime: string }>(apiPaths.groupMessages(activeGroupId), { method: "POST", body: JSON.stringify({ senderId: session.humanAgentId, content: text, contentType: "text" }) });
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: result.id, sendTime: result.sendTime } : m));
    } catch { /* keep optimistic on error */ }
    setStatus("idle");
    void refreshGroups(session);
  }, [activeGroupId, connectAgentStream, draft, refreshAgents, refreshGroups, session, setMessages, setDraft, setError, setStatus, setActiveGroupId, bottomRef]);

  return { getGroupLabel, deleteAgent, deleteGroup, deleteWorkspace, uploadFile, onFileInputChange, insertFileToDraft, hireSubAgent, onInterruptAllAgents, onSend };
}
