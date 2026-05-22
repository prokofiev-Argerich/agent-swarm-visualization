import fs from 'fs';

const file = 'app/im/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace state declarations (lines ~46-105)
const stateBlock = `  const [session, setSession] = useState<WorkspaceDefaults | null>(() => null);
  const [tokenLimit, setTokenLimit] = useState<number>(100000);
  const [groups, setGroups] = useState<Group[]>([]);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"boot" | "groups" | "messages" | "send" | "idle">("boot");
  const [error, setError] = useState<string | null>(null);
  const [stoppingAgents, setStoppingAgents] = useState(false);

  const [contentStream, setContentStream] = useState("");
  const [reasoningStream, setReasoningStream] = useState("");
  const [toolStream, setToolStream] = useState("");
  const [llmHistory, setLlmHistory] = useState("");
  const [agentError, setAgentError] = useState<string | null>(null);
  const [vizEvents, setVizEvents] = useState<VizEvent[]>([]);
  const [vizBeams, setVizBeams] = useState<VizBeam[]>([]);
  const [vizSize, setVizSize] = useState({ width: 640, height: 260 });
  const [vizScale, setVizScale] = useState(0.9);
  const [vizOffset, setVizOffset] = useState({ x: 0, y: 0 });
  const [vizIsPanning, setVizIsPanning] = useState(false);
  const [agentStatusById, setAgentStatusById] = useState<Record<string, AgentStatus>>({});
  const [vizDebug, setVizDebug] = useState<VizDebugEntry[]>([]);
  const [vizEventsCollapsed, setVizEventsCollapsed] = useState(false);
  const [rightPanels, setRightPanels] = useState<RightPanelState[]>([
    { id: "history", title: "LLM history", size: 320, collapsed: false },
    { id: "content", title: "Realtime content", size: 220, collapsed: false },
    { id: "reasoning", title: "Realtime reasoning", size: 220, collapsed: false },
    { id: "tools", title: "Realtime tools", size: 200, collapsed: false },
  ]);
  const [midSplitRatio, setMidSplitRatio] = useState(0.55);
  const [midStackHeight, setMidStackHeight] = useState(0);
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [collapsedAgents, setCollapsedAgents] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showFilesPanel, setShowFilesPanel] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phaseSummaries, setPhaseSummaries] = useState<PhaseSummary[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [phaseMessages, setPhaseMessages] = useState<Record<string, Message[]>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const streamAgentIdRef = useRef<string | null>(null);
  const streamAgentIdValueRef = useRef<string | null>(null);
  const agentRoleByIdRef = useRef<Map<string, string>>(new Map());
  const toolCallBuffersRef = useRef<Map<string, string>>(new Map());
  const toolResultBuffersRef = useRef<Map<string, string>>(new Map());
  const uiEsRef = useRef<EventSource | null>(null);
  const llmHistoryReqIdRef = useRef(0);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const midStackRef = useRef<HTMLDivElement | null>(null);
  const midChatHeightRef = useRef(0);`;

const newStateBlock = `  const [tokenLimit, setTokenLimit] = useState<number>(100000);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"boot" | "groups" | "messages" | "send" | "idle">("boot");
  const [error, setError] = useState<string | null>(null);
  const [stoppingAgents, setStoppingAgents] = useState(false);
  const [vizEventsCollapsed, setVizEventsCollapsed] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"causality" | "live" | "files">("causality");
  const [showLegacyViz, setShowLegacyViz] = usePersistedBoolean(LEGACY_VIZ_KEY, false);
  const [leftWidth, setLeftWidth] = usePersistedNumber(LEFT_WIDTH_KEY, 320, { min: 0, max: 800 });
  const [rightWidth, setRightWidth] = usePersistedNumber(RIGHT_WIDTH_KEY, 420, { min: 0, max: 800 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { session, createWorkspace } = useSession(workspaceOverrideId, setStatus, setError);
  const ws = useWorkspaceData(session, setStatus);
  const msgs = useMessages({ session, activeGroupId, refreshGroups: ws.refreshGroups, setStatus });

  useEffect(() => { if (session) setActiveGroupId(session.defaultGroupId); }, [session]);

  const { groups, agents, files, refreshGroups, refreshAgents, refreshFiles, agentRoleById } = ws;
  const { messages, setMessages, hasMore, nextCursor, loadingOlder, phaseSummaries, expandedPhases, phaseMessages, loadInitialMessages, refreshMessages, loadOlderMessages, togglePhaseExpand, messagesContainerRef, bottomRef } = msgs;
  const activeGroupIdRef = useRef<string | null>(null);
  const streamAgentIdValueRef = useRef<string | null>(null);
  const agentRoleByIdRef = useRef<Map<string, string>>(new Map());
  const groupsRef = useRef<Group[]>([]);
  const refreshQueueRef = useRef<{
    timer: number | null;
    pending: { groups: boolean; agents: boolean; messages: boolean; llmHistory: boolean };
  }>({ timer: null, pending: { groups: false, agents: false, messages: false, llmHistory: false } });

  const streamAgentId = useMemo(() => {
    if (!session) return null;
    if (!activeGroupId) return session.assistantAgentId;
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return session.assistantAgentId;
    return group.memberIds.find((id) => id !== session.humanAgentId) ?? session.assistantAgentId;
  }, [activeGroupId, groups, session]);

  const agentStream = useAgentStream({
    streamAgentId,
    activeGroupIdRef,
    onDone: () => {
      const groupId = activeGroupIdRef.current;
      const nextSession = loadSession();
      if (nextSession && groupId) {
        void refreshMessages(nextSession, groupId, { markRead: false });
      }
      if (nextSession) {
        void refreshGroups(nextSession);
      }
    },
  });

  const { contentStream, reasoningStream, toolStream, llmHistory, agentError, refreshLlmHistory, connectAgentStream } = agentStream;

  const causality = useCausality(messages, selectedMessageId, setSelectedMessageId);
  const displayItems = useDisplayItems(messages, phaseSummaries, expandedPhases, phaseMessages);
  const scrollToMessage = useScrollToMessage(messagesContainerRef);

  const viz = useVizInteractions();
  const mid = useMidSplitter();
  const rp = useRightPanels();

  const vizLayout = useVizLayout(agents, session, viz.vizSize, viz.nodeOffsets);`;

if (!content.includes(stateBlock)) {
  console.error('State block not found');
  process.exit(1);
}

content = content.replace(stateBlock, newStateBlock);

// 2. Remove extracted useCallbacks and useEffects (we'll identify them by their start)
// This is complex - let's instead keep only the ones we need
// We need: getGroupLabel, onSend, hireSubAgent, onInterruptAllAgents, deleteAgent, deleteGroup, uploadFile, etc.

// Write the result
fs.writeFileSync(file, content);
console.log('Phase 1-6 state replacement done');
