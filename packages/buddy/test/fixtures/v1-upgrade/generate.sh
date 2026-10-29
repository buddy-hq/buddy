#!/usr/bin/env bash
# Regenerates the v1-upgrade fixture by driving Buddy `main` (OpenCode v1) through its real HTTP API.
# Usage: generate.sh <temporary-worktree-of-main> <output-directory>
# Prepare the worktree first:
#   git worktree add --detach <tmp>/buddy-main main && (cd <tmp>/buddy-main && bun install --frozen-lockfile --ignore-scripts)
# Every HOME/TMP/XDG/Buddy/OpenCode root points under RUN_ROOT and the runtime starts from `env -i`,
# so nothing is inherited from the caller (no real Buddy state, no provider keys).
# The model is a scripted OpenAI-compatible server on 127.0.0.1; main's test network guard blocks any other host.
set -euo pipefail

MAIN_WORKTREE="$(cd "$1" && pwd -P)"
OUT_DIR="$2"
RUN_ROOT="/tmp/buddy-v1-fixture"
GENERATOR="$MAIN_WORKTREE/packages/buddy/script/generate-v1-upgrade-fixture.ts"

if [ -e "$RUN_ROOT" ]; then
  echo "refusing to reuse existing $RUN_ROOT" >&2
  exit 1
fi
mkdir -p "$RUN_ROOT"
RUN_ROOT="$(cd "$RUN_ROOT" && pwd -P)"
mkdir -p "$RUN_ROOT/home" "$RUN_ROOT/tmp" "$RUN_ROOT/xdg/data" "$RUN_ROOT/xdg/cache" \
  "$RUN_ROOT/xdg/config" "$RUN_ROOT/xdg/state"

cat > "$GENERATOR" <<'TS'
import fs from "node:fs"
import path from "node:path"
import { installTestNetworkGuard } from "../../../script/test-network"

const RUN_ROOT = requireEnv("FIXTURE_RUN_ROOT")
const NOTEBOOK_NAME = "Fixture Notebook"
const TEST_PROVIDER_ID = "test"
const TEST_MODEL_ID = "test-model"
const MODEL = { providerID: TEST_PROVIDER_ID, modelID: TEST_MODEL_ID }
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const MERMAID_SOURCE = "flowchart LR\n  Light --> Chlorophyll --> Glucose"
const FAKE_OPENAI_ACCOUNT_ID = "fixture-account-0001"
const FAKE_OPENAI_EXPIRES_MS = 1_893_456_000_000
const FAKE_MCP_NAME = "fixture-remote-mcp"
const FAKE_MCP_URL = "https://mcp.example.invalid/mcp"

const ISOLATED_ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "BUDDY_TEST_HOME",
  "BUDDY_TEST_XDG_ROOT",
  "BUDDY_DATA_DIR",
  "BUDDY_CACHE_DIR",
  "BUDDY_STATE_DIR",
  "BUDDY_GLOBAL_CONFIG_DIR",
  "OPENCODE_CONFIG_DIR",
  "BUDDY_ALLOWED_DIRECTORY_ROOTS",
] as const

const FORBIDDEN_INHERITED_KEYS = [
  "BUDDY_RUNTIME_ROOT",
  "BUDDY_CONFIG",
  "BUDDY_CONFIG_CONTENT",
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_AUTH_CONTENT",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be set`)
  return value
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function assertIsolatedEnvironment() {
  for (const key of ISOLATED_ENV_KEYS) {
    const value = requireEnv(key)
    if (!isInside(RUN_ROOT, value)) {
      throw new Error(`${key}=${value} is outside the fixture run root ${RUN_ROOT}`)
    }
  }
  for (const key of FORBIDDEN_INHERITED_KEYS) {
    if (process.env[key] !== undefined) throw new Error(`${key} must not be set`)
  }
}

assertIsolatedEnvironment()
installTestNetworkGuard()

type ChatMessage = { role: string; content?: unknown; tool_calls?: unknown }
type ChatBody = {
  model?: string
  stream?: boolean
  messages?: ChatMessage[]
  tools?: Array<{ function?: { name?: string; description?: string } }>
}
type Reply =
  | { kind: string; type: "text"; text: string }
  | { kind: string; type: "tool"; name: string; args: Record<string, unknown> }

const llmLog: Array<{ kind: string; tools: string[] }> = []
const scriptState = {
  notebookDirectory: "",
  subagentType: "",
  toolCallCounter: 0,
  textCounter: 0,
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((entry) =>
        entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string"
          ? entry.text
          : "",
      )
      .join("\n")
  }
  return ""
}

function chooseSubagent(tools: ChatBody["tools"]): string {
  const task = tools?.find((tool) => tool.function?.name === "task")
  const description = task?.function?.description ?? ""
  const preferred = ["general", "explore"]
  for (const name of preferred) {
    if (description.includes(`- ${name}:`) || description.includes(`"${name}"`)) return name
  }
  const match = description.match(/^- ([a-z0-9-]+):/m)
  return match?.[1] ?? "general"
}

function decideReply(body: ChatBody): Reply {
  const messages = body.messages ?? []
  const toolNames = (body.tools ?? []).flatMap((tool) =>
    tool.function?.name ? [tool.function.name] : [],
  )
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => contentText(message.content))
    .join("\n")
  const last = messages.at(-1)

  if (systemText.includes("You are a title generator")) {
    const userText = contentText(last?.content)
    if (userText.includes("FIXTURE_SECOND_CHAT")) {
      return { kind: "title", type: "text", text: "Respiration follow-up" }
    }
    return { kind: "title", type: "text", text: "Photosynthesis basics" }
  }

  if (systemText.includes("summarization assistant")) {
    return {
      kind: "compaction",
      type: "text",
      text: [
        "## Goal",
        "The learner is studying photosynthesis in the Fixture Notebook.",
        "## Progress",
        "- Explained light reactions and the Calvin cycle.",
        "- Read lesson.md, looked at a diagram image, and read reading-list.txt.",
        "- A subagent summarised the lesson.",
      ].join("\n"),
    }
  }

  if (last?.role === "tool") {
    scriptState.textCounter += 1
    return {
      kind: "after-tool",
      type: "text",
      text: `I checked that for you (step ${scriptState.textCounter}). The lesson says plants turn light, water and carbon dioxide into glucose and oxygen.`,
    }
  }

  const userText = contentText(last?.content)

  if (userText.includes("FIXTURE_READ") && toolNames.includes("read")) {
    return {
      kind: "tool-read",
      type: "tool",
      name: "read",
      args: { filePath: path.join(scriptState.notebookDirectory, "lesson.md") },
    }
  }

  if (userText.includes("FIXTURE_TASK") && toolNames.includes("task")) {
    scriptState.subagentType = chooseSubagent(body.tools)
    return {
      kind: "tool-task",
      type: "tool",
      name: "task",
      args: {
        description: "Summarise lesson",
        prompt: "FIXTURE_CHILD Summarise the photosynthesis lesson in two sentences.",
        subagent_type: scriptState.subagentType,
      },
    }
  }

  if (userText.includes("FIXTURE_CHILD")) {
    return {
      kind: "child",
      type: "text",
      text: "Photosynthesis converts light energy into chemical energy stored in glucose. It happens in chloroplasts and releases oxygen.",
    }
  }

  if (userText.includes("FIXTURE_MERMAID")) {
    return {
      kind: "mermaid",
      type: "text",
      text: ["Here is the flow as a diagram:", "", "```mermaid", MERMAID_SOURCE, "```"].join("\n"),
    }
  }

  scriptState.textCounter += 1
  return {
    kind: "text",
    type: "text",
    text: `Fixture assistant reply ${scriptState.textCounter}: photosynthesis uses light, water and carbon dioxide to make glucose and oxygen.`,
  }
}

function chunk(delta: Record<string, unknown>, finish?: string) {
  return {
    id: "chatcmpl-fixture",
    object: "chat.completion.chunk",
    created: 1_767_225_600,
    model: TEST_MODEL_ID,
    choices: [{ index: 0, delta, ...(finish ? { finish_reason: finish } : {}) }],
  }
}

const USAGE = { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 }

function streamLines(reply: Reply) {
  const lines: unknown[] = [chunk({ role: "assistant" })]
  if (reply.type === "text") {
    lines.push(chunk({ content: reply.text }))
    lines.push({ ...chunk({}, "stop"), usage: USAGE })
    return lines
  }
  scriptState.toolCallCounter += 1
  const id = `call_fixture_${scriptState.toolCallCounter}`
  lines.push(
    chunk({
      tool_calls: [{ index: 0, id, type: "function", function: { name: reply.name, arguments: "" } }],
    }),
  )
  lines.push(
    chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(reply.args) } }] }),
  )
  lines.push({ ...chunk({}, "tool_calls"), usage: USAGE })
  return lines
}

function completionJson(reply: Reply) {
  scriptState.toolCallCounter += reply.type === "tool" ? 1 : 0
  return {
    id: "chatcmpl-fixture",
    object: "chat.completion",
    created: 1_767_225_600,
    model: TEST_MODEL_ID,
    choices: [
      {
        index: 0,
        finish_reason: reply.type === "tool" ? "tool_calls" : "stop",
        message:
          reply.type === "text"
            ? { role: "assistant", content: reply.text }
            : {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call_fixture_${scriptState.toolCallCounter}`,
                    type: "function",
                    function: { name: reply.name, arguments: JSON.stringify(reply.args) },
                  },
                ],
              },
      },
    ],
    usage: USAGE,
  }
}

const llmServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 })
    }
    const body = (await request.json()) as ChatBody
    const reply = decideReply(body)
    llmLog.push({
      kind: reply.kind,
      tools: (body.tools ?? []).flatMap((tool) => (tool.function?.name ? [tool.function.name] : [])),
    })
    if (!body.stream) return Response.json(completionJson(reply))
    const payload =
      streamLines(reply)
        .map((line) => `data: ${JSON.stringify(line)}\n\n`)
        .join("") + "data: [DONE]\n\n"
    return new Response(payload, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    })
  },
})

const llmBaseURL = `http://127.0.0.1:${llmServer.port}/v1`

function writeGlobalConfig() {
  const configDirectory = requireEnv("BUDDY_GLOBAL_CONFIG_DIR")
  fs.mkdirSync(configDirectory, { recursive: true })
  const config = {
    model: `${TEST_PROVIDER_ID}/${TEST_MODEL_ID}`,
    small_model: `${TEST_PROVIDER_ID}/${TEST_MODEL_ID}`,
    learner_memory: { enabled: false, auto_extract: false },
    compaction: { auto: false },
    provider: {
      [TEST_PROVIDER_ID]: {
        name: "Fixture Test Provider",
        npm: "@ai-sdk/openai-compatible",
        options: { apiKey: "fixture-fake-key", baseURL: llmBaseURL },
        models: {
          [TEST_MODEL_ID]: {
            id: TEST_MODEL_ID,
            name: "Fixture Test Model",
            attachment: true,
            reasoning: false,
            temperature: false,
            tool_call: true,
            release_date: "2025-01-01",
            limit: { context: 100_000, output: 10_000 },
            cost: { input: 0, output: 0 },
            modalities: { input: ["text", "image"], output: ["text"] },
            options: {},
          },
        },
      },
    },
  }
  fs.writeFileSync(path.join(configDirectory, "buddy.jsonc"), JSON.stringify(config, null, 2))
}

writeGlobalConfig()

const { app } = await import("../src/index.ts")

type JsonValue = unknown

async function api(
  method: string,
  route: string,
  input: { directory?: string; body?: JsonValue; allowStatus?: number[] } = {},
): Promise<JsonValue> {
  const url = new URL(`http://buddy.local/api${route}`)
  const headers: Record<string, string> = {}
  if (input.directory) {
    url.searchParams.set("directory", input.directory)
    headers["x-buddy-directory"] = input.directory
  }
  if (input.body !== undefined) headers["content-type"] = "application/json"
  const response = await app.request(url.pathname + url.search, {
    method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  })
  const text = await response.text()
  const allowed = input.allowStatus ?? [200, 204]
  if (!allowed.includes(response.status)) {
    throw new Error(`${method} ${route} -> ${response.status}: ${text.slice(0, 2000)}`)
  }
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

type SessionInfo = { id: string; title: string; parentID?: string }
type MessageEntry = {
  info: { id: string; role: string; parentID?: string; summary?: boolean }
  parts: Array<{ id: string; type: string; text?: string; tool?: string; state?: { status?: string } }>
}

async function waitIdle(directory: string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const status = (await api("GET", "/session/status", { directory })) as Record<
      string,
      { type: string }
    >
    const busy = Object.values(status ?? {}).some((entry) => entry.type !== "idle")
    if (!busy) return
    await Bun.sleep(200)
  }
  throw new Error("sessions did not become idle")
}

async function prompt(
  directory: string,
  sessionID: string,
  text: string,
  extraParts: Array<Record<string, unknown>> = [],
) {
  await api("POST", `/session/${sessionID}/message`, {
    directory,
    body: Object.assign(
      { content: text, model: MODEL },
      extraParts.length > 0 ? { parts: extraParts } : undefined,
    ),
  })
  await waitIdle(directory)
}

async function messages(directory: string, sessionID: string) {
  return (await api("GET", `/session/${sessionID}/message`, { directory })) as MessageEntry[]
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url")
}

function fakeOpenAIAccessToken() {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }))
  const payload = base64url(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: FAKE_OPENAI_ACCOUNT_ID },
      exp: Math.floor(FAKE_OPENAI_EXPIRES_MS / 1000),
      fixture: "not-a-real-token",
    }),
  )
  return `${header}.${payload}.fixture-signature-not-real`
}

async function writeFakeMcpAuth() {
  const vendor = path.resolve(import.meta.dir, "../../../vendor/opencode/packages/opencode/src")
  const McpAuth = await import(path.join(vendor, "mcp/auth.ts"))
  const { makeRuntime } = await import(path.join(vendor, "effect/run-service.ts"))
  const { AppNodeBuilderV1 } = await import(path.join(vendor, "effect/app-node-builder-v1.ts"))
  const runtime = makeRuntime(McpAuth.Service, AppNodeBuilderV1.build(McpAuth.node))
  await runtime.runPromise((service: { set: Function }) =>
    service.set(
      FAKE_MCP_NAME,
      {
        tokens: {
          accessToken: "fixture-mcp-access-token-not-real",
          refreshToken: "fixture-mcp-refresh-token-not-real",
          expiresAt: Math.floor(FAKE_OPENAI_EXPIRES_MS / 1000),
          scope: "read",
        },
        clientInfo: {
          clientId: "fixture-mcp-client-id",
          clientSecret: "fixture-mcp-client-secret-not-real",
          clientIdIssuedAt: 1_767_225_600,
        },
      },
      FAKE_MCP_URL,
    ),
  )
}

const report: Record<string, unknown> = {}

const created = (await api("POST", "/open-projects/create", { body: { name: NOTEBOOK_NAME } })) as {
  directory: string
}
const notebook = created.directory
scriptState.notebookDirectory = notebook
report.notebookDirectory = notebook

fs.writeFileSync(
  path.join(notebook, "lesson.md"),
  "# Photosynthesis\n\nPlants use light, water and carbon dioxide to make glucose and oxygen.\n",
)
const outsideDirectory = path.join(RUN_ROOT, "outside")
fs.mkdirSync(outsideDirectory, { recursive: true })
const externalFile = path.join(outsideDirectory, "reading-list.txt")
fs.writeFileSync(externalFile, "Reading list\n1. Chloroplast structure\n2. Calvin cycle\n")

const parent = (await api("POST", "/session", {
  directory: notebook,
  body: {},
})) as SessionInfo
report.parentSessionID = parent.id

await prompt(notebook, parent.id, "What is photosynthesis?")
await prompt(notebook, parent.id, "FIXTURE_READ Please read lesson.md and tell me what it says.")
await prompt(notebook, parent.id, "What does this diagram show?", [
  {
    type: "file",
    mime: "image/png",
    filename: "leaf-diagram.png",
    url: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
  },
])
const externalFileURL = Bun.pathToFileURL(externalFile).href
await prompt(notebook, parent.id, "Use my reading list for the next step.", [
  {
    type: "file",
    mime: "text/plain",
    filename: "reading-list.txt",
    url: externalFileURL,
    source: {
      type: "file",
      path: externalFile,
      text: { value: "reading-list.txt", start: 0, end: "reading-list.txt".length },
    },
  },
])
await prompt(notebook, parent.id, "FIXTURE_TASK Ask a helper to summarise the lesson.")
await prompt(notebook, parent.id, "FIXTURE_MERMAID Draw the flow as a diagram.")

const parentMessagesBeforeCompaction = await messages(notebook, parent.id)
const mermaidAssistant = parentMessagesBeforeCompaction
  .filter((entry) => entry.info.role === "assistant")
  .findLast((entry) => entry.parts.some((part) => part.type === "text" && part.text?.includes("```mermaid")))
if (!mermaidAssistant) throw new Error("mermaid assistant message missing")
const mermaidPart = mermaidAssistant.parts.find(
  (part) => part.type === "text" && part.text?.includes("```mermaid"),
)!
const mermaidObject = (await api("POST", "/objects/mermaid/inline", {
  directory: notebook,
  body: {
    sessionID: parent.id,
    messageID: mermaidAssistant.info.id,
    partID: mermaidPart.id,
    segmentIndex: 0,
    source: MERMAID_SOURCE,
    alt: "Photosynthesis flow",
  },
})) as { objectID: string }
report.mermaid = {
  objectID: mermaidObject.objectID,
  messageID: mermaidAssistant.info.id,
  partID: mermaidPart.id,
}

const firstAssistant = parentMessagesBeforeCompaction.find(
  (entry) => entry.info.role === "assistant" && entry.parts.some((part) => part.type === "text"),
)
if (!firstAssistant) throw new Error("first assistant message missing")
const annotation = await api(
  "POST",
  `/notes/session/${parent.id}/message/${firstAssistant.info.id}/annotation`,
  { directory: notebook, body: { text: "Remember: light, water, CO2 in; glucose and O2 out." } },
)
report.annotation = { messageID: firstAssistant.info.id, result: annotation }

await api("POST", `/session/${parent.id}/summarize`, {
  directory: notebook,
  body: { providerID: TEST_PROVIDER_ID, modelID: TEST_MODEL_ID },
})
await waitIdle(notebook)
await prompt(notebook, parent.id, "Thanks. What happens at night?")

const second = (await api("POST", "/session", { directory: notebook, body: {} })) as SessionInfo
report.secondSessionID = second.id
await prompt(notebook, second.id, "FIXTURE_SECOND_CHAT How is respiration related?")
await waitIdle(notebook)

const sessions = (await api("GET", "/session", { directory: notebook })) as SessionInfo[]
report.sessions = sessions.map((session) => ({
  id: session.id,
  title: session.title,
  parentID: session.parentID,
}))
report.messages = {} as Record<string, unknown>
for (const session of sessions) {
  const entries = await messages(notebook, session.id)
  ;(report.messages as Record<string, unknown>)[session.id] = entries.map((entry) => ({
    id: entry.info.id,
    role: entry.info.role,
    summary: entry.info.summary,
    parts: entry.parts.map((part) =>
      Object.assign(
        { id: part.id, type: part.type },
        part.tool ? { tool: part.tool, status: part.state?.status } : undefined,
        part.type === "text" && part.text ? { text: part.text.slice(0, 80) } : undefined,
      ),
    ),
  }))
}

await api("PUT", "/auth/openai", {
  body: {
    type: "oauth",
    refresh: "fixture-openai-refresh-token-not-real",
    access: fakeOpenAIAccessToken(),
    expires: FAKE_OPENAI_EXPIRES_MS,
    accountId: FAKE_OPENAI_ACCOUNT_ID,
  },
})
await writeFakeMcpAuth()

report.subagentType = scriptState.subagentType
report.llmCalls = llmLog.map((entry) => entry.kind)
report.firstToolList = llmLog.find((entry) => entry.tools.length > 0)?.tools

await api("POST", "/global/dispose", { allowStatus: [200, 204] })
const { Instance } = await import("@buddy/opencode-adapter/instance")
await Instance.disposeAll()
llmServer.stop(true)

fs.writeFileSync(path.join(RUN_ROOT, "report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(0)
TS

BUN_BIN="$(command -v bun)"
(
  cd "$MAIN_WORKTREE/packages/buddy"
  env -i \
    PATH="$(dirname "$BUN_BIN"):/usr/bin:/bin:/usr/sbin:/sbin" \
    LANG=en_US.UTF-8 \
    TZ=UTC \
    NODE_ENV=test \
    FIXTURE_RUN_ROOT="$RUN_ROOT" \
    HOME="$RUN_ROOT/home" \
    USERPROFILE="$RUN_ROOT/home" \
    TMPDIR="$RUN_ROOT/tmp" \
    TMP="$RUN_ROOT/tmp" \
    TEMP="$RUN_ROOT/tmp" \
    XDG_DATA_HOME="$RUN_ROOT/xdg/data" \
    XDG_CACHE_HOME="$RUN_ROOT/xdg/cache" \
    XDG_CONFIG_HOME="$RUN_ROOT/xdg/config" \
    XDG_STATE_HOME="$RUN_ROOT/xdg/state" \
    BUDDY_TEST_HOME="$RUN_ROOT/home" \
    BUDDY_TEST_XDG_ROOT="$RUN_ROOT/xdg" \
    BUDDY_DATA_DIR="$RUN_ROOT/xdg/data/buddy" \
    BUDDY_CACHE_DIR="$RUN_ROOT/xdg/cache/buddy" \
    BUDDY_STATE_DIR="$RUN_ROOT/xdg/state/buddy" \
    BUDDY_GLOBAL_CONFIG_DIR="$RUN_ROOT/home/.buddy" \
    OPENCODE_CONFIG_DIR="$RUN_ROOT/home/.buddy" \
    BUDDY_ALLOWED_DIRECTORY_ROOTS="$RUN_ROOT" \
    BUDDY_DISABLE_SKILL_ARTIFACT_FETCH=1 \
    OPENCODE_DISABLE_DEFAULT_PLUGINS=1 \
    OPENCODE_DISABLE_MODELS_FETCH=1 \
    OPENCODE_DISABLE_EXTERNAL_SKILLS=1 \
    OPENCODE_DISABLE_AUTOUPDATE=1 \
    OPENCODE_DISABLE_AUTOCOMPACT=1 \
    OPENCODE_CLIENT=web \
    "$BUN_BIN" run script/generate-v1-upgrade-fixture.ts
)
rm -f "$GENERATOR"

BUDDY_HOME="$RUN_ROOT/home/Documents/Buddy"
NOTEBOOK="$BUDDY_HOME/Fixture Notebook"
RUNTIME_DATA="$RUN_ROOT/xdg/data/buddy/opencode"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd -P)"
rm -rf "$OUT_DIR/opencode.db" "$OUT_DIR/buddy-home" "$OUT_DIR/buddy-state" "$OUT_DIR/external"
/usr/bin/sqlite3 "file:$RUNTIME_DATA/opencode.db?mode=ro" "VACUUM INTO '$OUT_DIR/opencode.db'"
cp "$RUNTIME_DATA/auth.json" "$OUT_DIR/auth.json"
cp "$RUNTIME_DATA/mcp-auth.json" "$OUT_DIR/mcp-auth.json"
mkdir -p "$OUT_DIR/buddy-home/Fixture Notebook" "$OUT_DIR/buddy-home/Notes" "$OUT_DIR/buddy-state" "$OUT_DIR/external"
cp -R "$NOTEBOOK/.buddy" "$OUT_DIR/buddy-home/Fixture Notebook/.buddy"
cp "$NOTEBOOK/lesson.md" "$OUT_DIR/buddy-home/Fixture Notebook/lesson.md"
cp -R "$BUDDY_HOME/Notes/Chat notes" "$OUT_DIR/buddy-home/Notes/Chat notes"
cp "$RUN_ROOT/xdg/state/buddy/desktop-notebooks.json" "$OUT_DIR/buddy-state/desktop-notebooks.json"
cp "$RUN_ROOT/xdg/state/buddy/notes-notebook-identities.json" "$OUT_DIR/buddy-state/notes-notebook-identities.json"
cp "$RUN_ROOT/outside/reading-list.txt" "$OUT_DIR/external/reading-list.txt"
cp "$RUN_ROOT/report.json" "$OUT_DIR/report.json"
rm -rf "$RUN_ROOT"
