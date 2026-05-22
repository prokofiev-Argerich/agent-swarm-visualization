import fs from 'fs';

const file = 'app/im/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Helper to remove a block starting with a pattern until the matching closing
function removeBlock(startPattern, endPattern) {
  const regex = new RegExp(startPattern + '[\\s\\S]*?' + endPattern, 'g');
  content = content.replace(regex, '');
}

// Remove old state declarations that were replaced
// Already done by refactor.mjs

// Remove old useCallbacks that are now in hooks
const blocksToRemove = [
  // Data loading hooks (useSession, useWorkspaceData, useMessages)
  'const bootstrap = useCallback',
  'const createWorkspace = useCallback',
  'const refreshGroups = useCallback',
  'const refreshAgents = useCallback',
  'const refreshFiles = useCallback',
  'const loadPhaseSummaries = useCallback',
  'const loadInitialMessages = useCallback',
  'const refreshMessages = useCallback',
  'const loadOlderMessages = useCallback',
  'const loadPhaseMessages = useCallback',
  'const togglePhaseExpand = useCallback',
  'const scrollToMessage = useCallback',

  // Stream hooks (useAgentStream, useUiStream)
  'const formatLlmHistory = useCallback',
  'const refreshLlmHistory = useCallback',
  'const pushVizEvent = useCallback',
  'const pushBeam = useCallback',
  'const logVizDebug = useCallback',
  'const scheduleWorkspaceRefresh = useCallback',
  'const connectAgentStream = useCallback',

  // Interaction hooks (useVizLayout, useVizInteractions, useMidSplitter, useRightPanels)
  'const startNodeDrag = useCallback',
  'const handleNodePointerDown = useCallback',
  'const handleNodeMouseDown = useCallback',
  'const handleNodeTouchStart = useCallback',
  'const startMidResize = useCallback',
  'const handleMidResizeStart = useCallback',
  'const handleMidMouseDown = useCallback',
  'const handleMidTouchStart = useCallback',
  'const toggleRightPanel = useCallback',
  'const handleRightPanelResizeStart = useCallback',
  'const toggleAgentCollapsed = useCallback',
];

// These blocks end with `}, [deps]);` or `}, []);`
for (const blockStart of blocksToRemove) {
  // Find the block and remove it
  let idx = content.indexOf(blockStart);
  while (idx !== -1) {
    // Find the end of this block - look for `});` at the start of a line
    let endIdx = idx + blockStart.length;
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = endIdx; i < content.length - 2; i++) {
      const char = content[i];
      const prev = content[i - 1];

      if (inString) {
        if (char === stringChar && prev !== '\\\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{' || char === '(' || char === '[') {
        braceDepth++;
      } else if (char === '}' || char === ')' || char === ']') {
        braceDepth--;
      }

      if (braceDepth === 0 && char === ';' && content[i - 1] === ')') {
        // Found the end
        endIdx = i + 1;
        break;
      }
    }

    // Remove the block including any preceding blank lines
    let removeStart = idx;
    while (removeStart > 0 && content[removeStart - 1] === '\n') {
      removeStart--;
    }
    content = content.slice(0, removeStart) + content.slice(endIdx);

    // Find next occurrence
    idx = content.indexOf(blockStart);
  }
}

// Remove old useMemos that are now in hooks
const memosToRemove = [
  'const llmHistoryParsed = useMemo',
  'const llmHistoryFormatted = useMemo',
  'const vizLayout = useMemo',
  'const groupByAgentId = useMemo',
  'const agentTreeRows = useMemo',
  'const extraGroups = useMemo',
  'const messageById = useMemo',
  'const downstreamByMessageId = useMemo',
  'const selectedMessage = useMemo',
  'const upstreamMessage = useMemo',
  'const downstreamMessages = useMemo',
  'const completedPhaseIds = useMemo',
  'const displayItems = useMemo',
  'const activeGroup = useMemo',
  'const agentStats = useMemo',
  'const messageStats = useMemo',
  'const streamAgentId = useMemo',
  'const midChatHeight = useMemo',
];

for (const memoStart of memosToRemove) {
  let idx = content.indexOf(memoStart);
  while (idx !== -1) {
    let endIdx = idx + memoStart.length;
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = endIdx; i < content.length - 2; i++) {
      const char = content[i];
      const prev = content[i - 1];

      if (inString) {
        if (char === stringChar && prev !== '\\\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{' || char === '(' || char === '[') {
        braceDepth++;
      } else if (char === '}' || char === ')' || char === ']') {
        braceDepth--;
      }

      if (braceDepth === 0 && char === ';' && content[i - 1] === ')') {
        endIdx = i + 1;
        break;
      }
    }

    let removeStart = idx;
    while (removeStart > 0 && content[removeStart - 1] === '\n') {
      removeStart--;
    }
    content = content.slice(0, removeStart) + content.slice(endIdx);
    idx = content.indexOf(memoStart);
  }
}

// Remove old useEffects that are now in hooks
const effectsToRemove = [
  // useSession bootstrap effect
  'useEffect(() => {\n    void bootstrap',
  // useWorkspaceData session effect
  'useEffect(() => {\n    if (!session) return;\n    void refreshGroups',
  // useMessages effects
  'useEffect(() => {\n    if (!activeGroupId || !session) return;\n    void loadInitialMessages',
  // scroll listener
  'useEffect(() => {\n    const container = messagesContainerRef.current',
  // useAgentStream effects
  'useEffect(() => {\n    if (!streamAgentId) return;\n    connectAgentStream',
  'useEffect(() => {\n    return () => esRef.current?.close',
  // useUiStream effect
  'useEffect(() => {\n    if (!session) return;\n    uiEsRef.current?.close',
  // beam cleanup
  'useEffect(() => {\n    return () => {\n      beamTimeoutsRef.current.forEach',
  // causality cleanup
  'useEffect(() => {\n    if (selectedMessageId && !messageById.has',
  // viz refs
  'useEffect(() => {\n    nodeOffsetsRef.current = nodeOffsets',
  'useEffect(() => {\n    const el = vizRef.current\n    if (!el || typeof ResizeObserver',
  'useEffect(() => {\n    const el = midStackRef.current\n    if (!el || typeof ResizeObserver',
  'useEffect(() => {\n    const el = vizRef.current\n    if (!el) return;\n    const onWheel',
];

for (const effectStart of effectsToRemove) {
  let idx = content.indexOf(effectStart);
  while (idx !== -1) {
    // Find the end of this useEffect block
    let endIdx = idx + effectStart.length;
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;

    for (let i = idx; i < content.length - 2; i++) {
      const char = content[i];
      const prev = content[i - 1];

      if (inString) {
        if (char === stringChar && prev !== '\\\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      }

      if (char === '{' || char === '(' || char === '[') {
        braceDepth++;
      } else if (char === '}' || char === ')' || char === ']') {
        braceDepth--;
      }

      if (parenDepth === 0 && braceDepth === 0 && char === ';' && content.substring(i - 1, i + 1) === ');') {
        endIdx = i + 1;
        break;
      }
    }

    let removeStart = idx;
    // Remove preceding whitespace/newlines
    while (removeStart > 0 && (content[removeStart - 1] === '\n' || content[removeStart - 1] === ' ')) {
      removeStart--;
    }
    content = content.slice(0, removeStart) + content.slice(endIdx);
    idx = content.indexOf(effectStart);
  }
}

// Remove old helper functions
const helpersToRemove = [
  'const statusColor = (status?: AgentStatus)',
  'const summarizeHistoryEntry = useCallback',
  'const historyRole = useCallback',
  'const historyAccent = useCallback',
];

for (const helperStart of helpersToRemove) {
  let idx = content.indexOf(helperStart);
  while (idx !== -1) {
    let endIdx = idx + helperStart.length;
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = endIdx; i < content.length - 2; i++) {
      const char = content[i];
      const prev = content[i - 1];

      if (inString) {
        if (char === stringChar && prev !== '\\\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{' || char === '(' || char === '[') {
        braceDepth++;
      } else if (char === '}' || char === ')' || char === ']') {
        braceDepth--;
      }

      if (braceDepth === 0 && char === ';' && content[i - 1] === ')') {
        endIdx = i + 1;
        break;
      }
    }

    let removeStart = idx;
    while (removeStart > 0 && content[removeStart - 1] === '\n') {
      removeStart--;
    }
    content = content.slice(0, removeStart) + content.slice(endIdx);
    idx = content.indexOf(helperStart);
  }
}

// Clean up multiple consecutive blank lines
content = content.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(file, content);
console.log('Transformation done. New length:', content.length);
