"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { apiPaths } from "@/lib/api-paths";
import { api, loadSession, saveSession } from "../utils";
import type { WorkspaceDefaults } from "../types";

export function useSession(
  workspaceOverrideId: string | null,
  setStatus: (s: "boot" | "groups" | "messages" | "send" | "idle") => void,
  setError: (e: string | null) => void,
) {
  const [session, setSession] = useState<WorkspaceDefaults | null>(null);

  const bootstrap = useCallback(async () => {
    setError(null);
    setStatus("boot");

    if (workspaceOverrideId) {
      const ensured = await api<WorkspaceDefaults>(
        apiPaths.workspaceDefaults(workspaceOverrideId)
      );
      saveSession(ensured);
      setSession(ensured);
      setStatus("idle");
      return;
    }

    const existing = loadSession();
    if (existing) {
      try {
        const ensured = await api<WorkspaceDefaults>(
          apiPaths.workspaceDefaults(existing.workspaceId)
        );
        saveSession(ensured);
        setSession(ensured);
        setStatus("idle");
        return;
      } catch {
        // fall through
      }
    }

    try {
      const recent = await api<{
        workspaces: Array<{ id: string; name: string; createdAt: string }>;
      }>(`/api/workspaces`);
      if (recent.workspaces.length > 0) {
        const targetId = recent.workspaces[0]!.id;
        const ensured = await api<WorkspaceDefaults>(
          apiPaths.workspaceDefaults(targetId)
        );
        saveSession(ensured);
        setSession(ensured);
        setStatus("idle");
        return;
      }
    } catch {
      // fall through
    }

    const created = await api<WorkspaceDefaults>(`/api/workspaces`, {
      method: "POST",
      body: JSON.stringify({ name: "Default Workspace" }),
    });
    saveSession(created);
    setSession(created);
    setStatus("idle");
  }, [workspaceOverrideId, setStatus, setError]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    void bootstrap().catch((e) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  }, [bootstrap, setError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createWorkspace = useCallback(
    async (name?: string) => {
      setError(null);
      setStatus("boot");
      const created = await api<WorkspaceDefaults>(`/api/workspaces`, {
        method: "POST",
        body: JSON.stringify({ name: name?.trim() || "New Workspace" }),
      });
      saveSession(created);
      setSession(created);
      setStatus("idle");
      window.history.replaceState(null, "", "/im");
      return created;
    },
    [setStatus, setError]
  );

  return { session, setSession, createWorkspace };
}
