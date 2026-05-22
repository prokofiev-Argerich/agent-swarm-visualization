"use client";

import { useMemo } from "react";
import { toTimestamp } from "../utils";
import type { AgentMeta, UUID, WorkspaceDefaults } from "../types";

export function useVizLayout(
  agents: AgentMeta[],
  session: WorkspaceDefaults | null,
  vizSize: { width: number; height: number },
  nodeOffsets: Record<string, { x: number; y: number }>
) {
  return useMemo(() => {
    const width = Math.max(1, vizSize.width);
    const height = Math.max(1, vizSize.height);
    const paddingX = 70;
    const paddingY = 60;
    const byId = new Map(agents.map((a) => [a.id, a]));
    const parentById = new Map<string, string | null>();
    const childrenById = new Map<string, AgentMeta[]>();
    const roots: AgentMeta[] = [];

    for (const agent of agents) {
      const parentId = agent.parentId;
      if (parentId && parentId !== agent.id && byId.has(parentId)) {
        const list = childrenById.get(parentId) ?? [];
        list.push(agent);
        childrenById.set(parentId, list);
        parentById.set(agent.id, parentId);
      } else {
        roots.push(agent);
        parentById.set(agent.id, null);
      }
    }

    const byCreatedAt = (a: AgentMeta, b: AgentMeta) =>
      toTimestamp(a.createdAt) - toTimestamp(b.createdAt);

    for (const list of childrenById.values()) list.sort(byCreatedAt);
    roots.sort(byCreatedAt);

    if (session) {
      const humanIndex = roots.findIndex((a) => a.id === session.humanAgentId);
      if (humanIndex > -1) {
        const [human] = roots.splice(humanIndex, 1);
        roots.unshift(human);
      }
    }

    const nodeMeta = new Map<string, { xIndex: number; depth: number }>();
    let leafIndex = 0;
    let maxDepth = 0;
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const walk = (agent: AgentMeta, depth: number): { min: number; max: number } => {
      if (visited.has(agent.id)) {
        const meta = nodeMeta.get(agent.id);
        if (meta) return { min: meta.xIndex, max: meta.xIndex };
      }
      if (visiting.has(agent.id)) {
        const xIndex = leafIndex++;
        nodeMeta.set(agent.id, { xIndex, depth });
        return { min: xIndex, max: xIndex };
      }
      visiting.add(agent.id);
      maxDepth = Math.max(maxDepth, depth);
      const children = (childrenById.get(agent.id) ?? []).filter((child) => child.id !== agent.id);
      let range: { min: number; max: number };
      if (children.length === 0) {
        const xIndex = leafIndex++;
        nodeMeta.set(agent.id, { xIndex, depth });
        range = { min: xIndex, max: xIndex };
      } else {
        const ranges = children.map((child) => walk(child, depth + 1));
        const min = ranges[0]?.min ?? leafIndex;
        const max = ranges[ranges.length - 1]?.max ?? min;
        const xIndex = (min + max) / 2;
        nodeMeta.set(agent.id, { xIndex, depth });
        range = { min, max };
      }
      visiting.delete(agent.id);
      visited.add(agent.id);
      return range;
    };

    roots.forEach((root) => {
      walk(root, 0);
    });

    for (const agent of agents) {
      if (!nodeMeta.has(agent.id)) {
        walk(agent, 0);
      }
    }

    const leafCount = Math.max(1, leafIndex);
    const depthCount = Math.max(1, maxDepth + 1);
    const baseSpan = Math.max(1, width - paddingX * 2);
    const maxSpan =
      leafCount <= 2 ? Math.min(baseSpan, 360) : leafCount <= 4 ? Math.min(baseSpan, 520) : baseSpan;
    const xSpan = Math.max(1, maxSpan);
    const xStart = (width - xSpan) / 2;
    const ySpan = Math.max(1, height - paddingY * 2);
    const xStep = leafCount === 1 ? 0 : xSpan / (leafCount - 1);
    const yStep = depthCount === 1 ? 0 : ySpan / (depthCount - 1);

    const basePositions = new Map<string, { x: number; y: number }>();
    for (const agent of agents) {
      const meta = nodeMeta.get(agent.id);
      if (!meta) continue;
      basePositions.set(agent.id, {
        x: xStart + meta.xIndex * xStep,
        y: paddingY + meta.depth * yStep,
      });
    }

    const offsetCache = new Map<string, { x: number; y: number }>();
    const positions = new Map<string, { x: number; y: number }>();
    const getAccumulatedOffset = (id: string) => {
      if (offsetCache.has(id)) return offsetCache.get(id)!;
      let x = 0;
      let y = 0;
      const seen = new Set<string>();
      let current: string | null | undefined = id;
      while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const offset = nodeOffsets[current];
        if (offset) {
          x += offset.x;
          y += offset.y;
        }
        current = parentById.get(current) ?? null;
      }
      const total = { x, y };
      offsetCache.set(id, total);
      return total;
    };

    for (const agent of agents) {
      const base = basePositions.get(agent.id);
      if (!base) continue;
      const offset = getAccumulatedOffset(agent.id);
      positions.set(agent.id, { x: base.x + offset.x, y: base.y + offset.y });
    }

    const ordered = [...agents].sort((a, b) => {
      const da = nodeMeta.get(a.id)?.depth ?? 0;
      const db = nodeMeta.get(b.id)?.depth ?? 0;
      if (da !== db) return da - db;
      return byCreatedAt(a, b);
    });

    const edges: Array<{ fromId: UUID; toId: UUID }> = [];
    for (const [parentId, children] of childrenById.entries()) {
      for (const child of children) {
        edges.push({ fromId: parentId, toId: child.id });
      }
    }

    return { positions, ordered, edges, parentById };
  }, [agents, session, vizSize.height, vizSize.width, nodeOffsets]);
}
