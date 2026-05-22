import type { HistoryMessage } from "../types";

export const SKILLS_MARKER = "[skills:loaded]";

export function historyHasSkills(history: HistoryMessage[]) {
  return history.some(
    (msg) =>
      msg.role === "system" && typeof msg.content === "string" && msg.content.includes(SKILLS_MARKER)
  );
}

export async function buildSkillsBlock(): Promise<string> {
  try {
    const { getSkillLoader, formatSkillPrompt } = await import("../skill-loader");
    const loader = await getSkillLoader();
    const skillsMetadata = await loader.getSkillsMetadataPrompt();
    const autoSkills = await loader.listAutoLoadSkills();
    const autoBlocks = autoSkills.map((skill) => formatSkillPrompt(skill)).join("\n\n");
    const skillsParts = [skillsMetadata, autoBlocks].filter((part) => part && part.trim());
    if (skillsParts.length === 0) return "";
    return `${SKILLS_MARKER}\n\n${skillsParts.join("\n\n")}`;
  } catch {
    return "";
  }
}
