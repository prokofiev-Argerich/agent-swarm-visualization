# Swarm-IDE 提示词清单

> 本仓库**所有**直接进入 LLM 上下文(system / user / tool 消息)的硬编码文本,从源码提取。
> 不含 MCP 外部工具描述(由外部 server 提供)、不含 Skill 文件内容(`skills/` 目录里写的 `SKILL.md`)。

---

## 一、基础 system prompt(两份,内容近似但**不完全一致**)

### 1.1 创建时的初始 system prompt

**位置**:[`backend/src/lib/storage/shared.ts:31-40`](backend/src/lib/storage/shared.ts#L31-L40) — 由 `initialAgentHistory()` 在 agent 写入数据库时生成。

```
You are an agent in an IM system.
Your agent_id is: {agentId}.
Your workspace_id is: {workspaceId}.
Your role is: {role}.
Act strictly as this role when replying. Be concise and helpful.
Your replies are NOT automatically delivered to humans.
To send messages, you MUST call tools like send_group_message or send_direct_message.
If you need to coordinate with other agents, you may use tools like self, list_agents, create, send, list_groups, list_group_members, create_group, send_group_message, send_direct_message, and get_group_messages.
If you need to read a file that was uploaded to this workspace, use the read_file tool with the fileId (never a filesystem path).
```

### 1.2 runtime 兜底 system prompt(history 为空时补一份)

**位置**:[`backend/src/runtime/agent-runtime.ts:516-525`](backend/src/runtime/agent-runtime.ts#L516-L525) — 当 `agent.llmHistory` 解析为空数组时由 `processGroupUnread()` 注入。

```
You are an agent in an IM system.
Your agent_id is: {this.agentId}.
Your workspace_id is: {workspaceId}.
Your role is: {role}.
Act strictly as this role when replying. Be concise and helpful.
Your replies are NOT automatically delivered to humans.
To send messages, you MUST call tools like send_group_message or send_direct_message.
If you need to coordinate with other agents, you may use tools like self, list_agents, create, send, list_groups, list_group_members, create_group, send_group_message, send_direct_message, and get_group_messages.
If you need to run shell commands, use the bash tool.
If you need to read a file that was uploaded to this workspace, use the read_file tool with the fileId (never a filesystem path).
```

> 与 1.1 的差异:**多一行** `If you need to run shell commands, use the bash tool.` 。1.1 不提 bash。

### 1.3 可选 guidance(创建 sub-agent 时由父 agent 通过 `create` 工具的 `guidance` 参数提供)

**位置**:[`backend/src/lib/storage/shared.ts:43-49`](backend/src/lib/storage/shared.ts#L43-L49) — 第二条 system 消息,**仅当** `guidance` 非空时追加。

```
Additional instructions:
{guidance}
```

---

## 二、Skill 注入

### 2.1 Skill 列表元数据 prompt

**位置**:[`backend/src/runtime/skill-loader.ts:246-258`](backend/src/runtime/skill-loader.ts#L246-L258) — 由 `getSkillsMetadataPrompt()` 拼接。仅当存在已发现的 skill 时输出。

```
## Available Skills
You have access to specialized skills. Each skill provides expert guidance for specific tasks.
Load a skill's full content using the get_skill tool when needed.

- `{skill_name_1}`: {description_1}
- `{skill_name_2}`: {description_2}
...
```

### 2.2 Auto-load Skill 完整内容模板

**位置**:[`backend/src/runtime/skill-loader.ts:277-298`](backend/src/runtime/skill-loader.ts#L277-L298) — `formatSkillPrompt(skill)`。被注入的 skill 走这个模板包一层。

```
# Skill: {skill.name}

{skill.description}

---

## Skill Root Directory
This skill is located at: `{skill.skillDir}`

All relative paths in this skill should be resolved from this directory.
You can use tools like ls/find to locate files if needed.

---

{skill.content}
```

### 2.3 SKILLS_MARKER(隐藏 tag,用于判断 history 里是否已经注入过 skills 块)

**位置**:[`backend/src/runtime/agent-runtime.ts:33`](backend/src/runtime/agent-runtime.ts#L33) 与 [`agent-runtime.ts:44`](backend/src/runtime/agent-runtime.ts#L44)。

```
[skills:loaded]
```

skills 块完整形态:
```
[skills:loaded]

{skills metadata prompt 见 2.1}

{auto-load skill 1 见 2.2}

{auto-load skill 2 见 2.2}
...
```

---

## 三、上传文件清单(动态注入到 system context)

**位置**:[`backend/src/runtime/agent-runtime.ts:54-65`](backend/src/runtime/agent-runtime.ts#L54-L65) — 由 `buildFilesBlock(workspaceId)` 生成。每次处理消息前,从 history 里**移除旧版本再追加新版本**,所以总是最新 20 条文件。

```
## Uploaded Files in this Workspace
The following files have been uploaded to this workspace. To read any file, you MUST use the read_file tool with the fileId (never a filesystem path). Do NOT use bash or cat to read uploaded files.

- {filename_1} (fileId: {id_1}, size: {size_1} bytes)
- {filename_2} (fileId: {id_2}, size: {size_2} bytes)
...
```

若文件超过 20 个,追加:
```

... and {N - 20} more files (not shown).
```

---

## 四、消息格式(user 角色)

**位置**:[`backend/src/runtime/agent-runtime.ts:545-547`](backend/src/runtime/agent-runtime.ts#L545-L547) — 把未读消息拼成单条 user 消息。

```
[group:{groupId}] {senderId_1}: {content_1}
[group:{groupId}] {senderId_2}: {content_2}
...
```

多条未读用换行连接;**所有发送者** id 一律直接出现(包括人类的 humanAgentId)。

---

## 五、no-send reminder(后置提醒)

**位置**:[`backend/src/runtime/agent-runtime.ts:569-572`](backend/src/runtime/agent-runtime.ts#L569-L572) — 若一轮 LLM 调用结束后**未触发任何** `send` / `send_group_message` / `send_direct_message`,且未被中断,再追加一条 user 消息触发第二轮:

```
Reminder: 本轮未调用 send_*。先判断是否需要对外可见；需要时使用 send_group_message 或 send_direct_message，无需时可不发送。
```

这是混合中英文的 prompt,源自 commit `38f5881 Prompt when no send_* call`。

---

## 六、内置工具 13 个(name + description + parameters)

**位置**:[`backend/src/runtime/agent-runtime.ts:93-290`](backend/src/runtime/agent-runtime.ts#L93-L290) — `AGENT_TOOLS` 常量。所有 agent 拿到的工具集是这 13 个 + MCP server 注入的工具。

### 6.1 `create`
> Create a sub-agent with the given role for delegation. Returns {agentId}.

参数:
- `role` (string, required): Role name for the new agent, e.g. coder/researcher/reviewer
- `guidance` (string, optional): Extra system guidance to seed the new agent.

### 6.2 `self`
> Return the current agent's identity (agent_id, workspace_id, role).

参数:无。

### 6.3 `get_skill`
> Load the full content of a specific skill by name (use when the skill metadata indicates relevance).

参数:
- `skill_name` (string, required): Skill name to retrieve

### 6.4 `list_agents`
> List all agents in the current workspace (ids + roles).

参数:无。

### 6.5 `send`
> Send a direct message to another agent_id. The IM storage (group) is created/selected automatically.

参数:
- `to` (string, required): Target agent_id
- `content` (string, required): Message content

### 6.6 `list_groups`
> List visible groups for this agent.

参数:无。

### 6.7 `list_group_members`
> List member ids for a group.

参数:
- `groupId` (string, required): Target group id

### 6.8 `create_group`
> Create a group with the given member ids.

参数:
- `memberIds` (string[], required)
- `name` (string, optional)

### 6.9 `send_group_message`
> Send a message to a group.

参数:
- `groupId` (string, required)
- `content` (string, required)
- `contentType` (string, optional)

### 6.10 `send_direct_message`
> Send a direct message to another agent. Creates or reuses a P2P group and returns the channel type.

参数:
- `toAgentId` (string, required)
- `content` (string, required)
- `contentType` (string, optional)

### 6.11 `get_group_messages`
> Fetch full message history for a group.

参数:
- `groupId` (string, required)

### 6.12 `read_file`
> Read the contents of a file that was uploaded to the workspace. Accepts a fileId (returned by upload), never a filesystem path. Returns {filename, content, truncated}. Only files within the current workspace are accessible.

参数:
- `fileId` (string, required): The fileId returned by the upload API

### 6.13 `bash`
> Run a shell command on the server. Returns stdout/stderr/exitCode. Use for debugging or file operations.

参数:
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory (relative to workspace root or absolute)
- `timeoutMs` (number, optional): Timeout in milliseconds (default 120000)
- `maxOutputKB` (number, optional): Maximum combined output size in KB (default 1024)

---

## 七、组装顺序(实际进入 LLM 的 history 形态)

```
1. system  : 基础 prompt(§1.1 或 §1.2)  ←  首次 + skills 块嵌在末尾
   (可选) 第二条 system: Additional instructions(§1.3)
2. system  : [skills:loaded]
              ## Available Skills
              - ...
              {auto-load skill 完整内容…}                ←  仅在已发现 skill 时
3. system  : ## Uploaded Files in this Workspace
              - ...                                       ←  每次处理消息前刷新
4. user    : [group:G] sender: content                    ←  本轮未读消息(可多行)
5. assistant + tool_calls / tool messages (循环最多 3 轮)
6. (可选) user: Reminder: 本轮未调用 send_*…             ←  没 send 时追加触发第二轮
```

---

## 八、不在本文档中的提示词

- **MCP 外部工具的 description / parameters** — 来源于 `mcp.json` 配置的外部 server,运行时通过 MCP 协议获取,不在仓库代码里
- **Skill 文件正文(`skills/{name}/SKILL.md`)** — 由 Skill 作者书写,作为内容动态注入(见 §2.2 模板);**当前 `skills/` 目录为空**(见 ARCHITECTURE.md 第七节)
- **前端 UI 的提示文案**(按钮 label、错误 toast 等) — 不进入 LLM,故不在本文档

---

## 九、维护建议

- 改 §1.1 和 §1.2 时**两份要一起改**(目前内容有一处差异:bash 提示只在 1.2),建议长期合并为单一来源
- §5 的中英文混合 prompt 在生产环境可能令模型偏向中文回复;若 workspace 跨语言协作,建议统一为英文
- §6 的工具描述里多个动词模糊(如 `read_file` 的 "Only files within the current workspace are accessible" 是事实陈述,不是禁令),如果 agent 多次绕过 `read_file` 用 `bash cat` 读上传文件,可以加强禁令语气
