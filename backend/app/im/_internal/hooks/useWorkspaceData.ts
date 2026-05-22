"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../utils";
import type { AgentMeta, FileItem, Group, WorkspaceDefaults } from "../types";

export function useWorkspaceData(
  session: WorkspaceDefaults | null,
  setStatus: (s: "boot" | "groups" | "messages" | "send" | "idle") => void,
) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);

  const refreshGroups = useCallback(
    async (s: WorkspaceDefaults, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setStatus("groups");
      const q = new URLSearchParams({ workspaceId: s.workspaceId, agentId: s.humanAgentId });
      const { groups } = await api<{ groups: Group[] }>(`/api/groups?${q.toString()}`);
      setGroups(groups);
      if (!opts?.silent) setStatus("idle");
    },
    [setStatus]
  );

  const refreshAgents = useCallback(
    async (s: WorkspaceDefaults) => {
      const { agents } = await api<{ agents: AgentMeta[] }>(
        `/api/agents?workspaceId=${encodeURIComponent(s.workspaceId)}&meta=true`
      );
      setAgents(agents);
    },
    []
  );

  const refreshFiles = useCallback(
    async (s: WorkspaceDefaults) => {
      const { files } = await api<{ files: FileItem[] }>(
        `/api/files?workspaceId=${encodeURIComponent(s.workspaceId)}`
      );
      setFiles(files);
    },
    []
  );

  const agentRoleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.role);
    return map;
  }, [agents]);

  useEffect(() => {
    if (!session) return;
    setGroups([]);
    setAgents([]);
    setFiles([]);
    void refreshGroups(session, { silent: true });
    void refreshAgents(session);
    void refreshFiles(session);
  }, [session, refreshGroups, refreshAgents, refreshFiles]);

  return {
    groups,
    setGroups,
    agents,
    setAgents,
    files,
    setFiles,
    refreshGroups,
    refreshAgents,
    refreshFiles,
    agentRoleById,
  };
}
