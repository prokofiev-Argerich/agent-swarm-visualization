import type { RightPanelState } from "./types";

export const LEGACY_VIZ_KEY = "swarm-ide.im.showLegacyViz";
export const LEFT_WIDTH_KEY = "swarm-ide.im.leftWidth";
export const RIGHT_WIDTH_KEY = "swarm-ide.im.rightWidth";

export const RIGHT_PANEL_MIN_HEIGHT = 120;
export const RIGHT_PANEL_HEADER_HEIGHT = 32;
export const MID_CHAT_MIN_HEIGHT = 0;
export const MID_GRAPH_MIN_HEIGHT = 160;
export const MID_SPLITTER_SIZE = 6;

export const INITIAL_RIGHT_PANELS: RightPanelState[] = [
  { id: "history", title: "LLM history", size: 320, collapsed: false },
  { id: "content", title: "Realtime content", size: 220, collapsed: false },
  { id: "reasoning", title: "Realtime reasoning", size: 220, collapsed: false },
  { id: "tools", title: "Realtime tools", size: 200, collapsed: false },
];
