import { store } from "@/lib/storage";

export async function createWorkflowPhase(input: Parameters<typeof store.createWorkflowPhase>[0]) {
  return store.createWorkflowPhase(input);
}

export async function getActiveWorkflowPhase(input: Parameters<typeof store.getActiveWorkflowPhase>[0]) {
  return store.getActiveWorkflowPhase(input);
}

export async function endWorkflowPhase(input: Parameters<typeof store.endWorkflowPhase>[0]) {
  return store.endWorkflowPhase(input);
}

export async function listPhaseSummaries(input: Parameters<typeof store.listPhaseSummaries>[0]) {
  return store.listPhaseSummaries(input);
}

export async function createPhaseSummary(input: Parameters<typeof store.createPhaseSummary>[0]) {
  return store.createPhaseSummary(input);
}
