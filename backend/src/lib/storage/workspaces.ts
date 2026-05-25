import { eq, desc, inArray, sql as dsql } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces, agents, groups, groupMembers, messages, files, workflowPhases, phaseSummaries } from "@/db/schema";
import { now, type UUID } from "./shared";

export async function listWorkspaces(): Promise<Array<{ id: UUID; name: string; createdAt: string }>> {
  const db = getDb();
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function deleteWorkspace(input: { workspaceId: UUID }) {
  const db = getDb();

  const ws = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (ws.length === 0) throw new Error("workspace not found");

  await db.transaction(async (tx) => {
    // 1. delete phaseSummaries (refs workflowPhases)
    await tx.delete(phaseSummaries).where(eq(phaseSummaries.workspaceId, input.workspaceId));
    // 2. delete workflowPhases (refs groups)
    await tx.delete(workflowPhases).where(eq(workflowPhases.workspaceId, input.workspaceId));
    // 3. delete messages (refs groups)
    await tx.delete(messages).where(eq(messages.workspaceId, input.workspaceId));
    // 4. delete groupMembers (refs groups)
    await tx.delete(groupMembers).where(
      inArray(
        groupMembers.groupId,
        tx.select({ id: groups.id }).from(groups).where(eq(groups.workspaceId, input.workspaceId))
      )
    );
    // 5. delete groups
    await tx.delete(groups).where(eq(groups.workspaceId, input.workspaceId));
    // 6. delete agents with parentId first (self-ref), then rest
    await tx.delete(agents).where(
      dsql`${agents.workspaceId} = ${input.workspaceId} and ${agents.parentId} is not null`
    );
    await tx.delete(agents).where(eq(agents.workspaceId, input.workspaceId));
    // 7. delete files
    await tx.delete(files).where(eq(files.workspaceId, input.workspaceId));
    // 8. delete workspace
    await tx.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
  });
}
