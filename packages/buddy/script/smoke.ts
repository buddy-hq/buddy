/**
 * Buddy HTTP smoke test against a locally running server.
 *
 * Prerequisites:
 *   - Buddy backend already listening (desktop app or `bun run start`)
 *   - Provider credentials configured (prompt check calls the model and tools)
 *
 * Defaults (override only via env when the server sets them):
 *   - URL: http://127.0.0.1:${PORT:-3000}
 *   - Auth: Buddy server username + password env when set
 *
 * Usage:
 *   bun run --cwd packages/buddy smoke
 *   bun run smoke   # from repo root
 */

import { BUDDY_ENV } from "../src/storage"
import {
  parseTJsonArray,
  parseTJsonObject,
  parseTJsonText,
  parseTString,
  parseTStringArray,
  type TJsonObject,
  type TJsonValue,
} from "./parse-values"

const SMOKE_HOST = "127.0.0.1"
const SMOKE_DEFAULT_PORT = 3000
const API_PREFIX = "/api"
const REQUEST_TIMEOUT_MS = 30_000
const PROMPT_WAIT_MS = 180_000
const PROMPT_POLL_MS = 2_000
const MISSING_STATUS_IDLE_POLL_COUNT = 2
const MAX_SESSIONS_TO_SCAN = 5
const MIN_COMPLETED_TOOL_PARTS = 2

const SMOKE_PROMPT_TEXT = [
  "Smoke test only. Execute these tool calls in order, then stop:",
  '1. Call learning_tool_search with query "reflection".',
  "2. Call learning_tool_load with the first tool id returned in step 1.",
  '3. Call learner_memory_search with query "smoke".',
  "Reply with exactly: SMOKE_OK",
].join("\n")

type TSmokeCheck = {
  name: string
  run: () => Promise<void>
}

function readSmokeBaseUrl() {
  const portRaw = process.env.PORT
  const parsed = portRaw ? Number.parseInt(portRaw, 10) : SMOKE_DEFAULT_PORT
  const port = Number.isFinite(parsed) ? parsed : SMOKE_DEFAULT_PORT
  return `http://${SMOKE_HOST}:${port}`
}

function readBasicAuthHeader(): string | undefined {
  const username = process.env[BUDDY_ENV.SERVER_USERNAME]?.trim()
  const password = process.env[BUDDY_ENV.SERVER_PASSWORD]?.trim()
  if (!username || !password) return undefined
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64")
  return `Basic ${encoded}`
}

function formatPath(path: string, query?: Record<string, string>) {
  const url = new URL(path, readSmokeBaseUrl())
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

async function smokeFetch(path: string, init?: RequestInit & { query?: Record<string, string> }) {
  const authorization = readBasicAuthHeader()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(formatPath(path, init?.query), {
      ...init,
      signal: controller.signal,
      headers: Object.assign(
        { accept: "application/json" as const },
        authorization ? { authorization } : undefined,
        init?.headers,
      ),
    })

    const contentType = response.headers.get("content-type") ?? ""
    const bodyText = await response.text()
    let body: TJsonValue | string = bodyText
    if (contentType.includes("application/json") && bodyText.length > 0) {
      const parsed = parseTJsonText(bodyText)
      if (parsed === undefined) {
        throw new Error(`invalid JSON from ${path}`)
      }
      body = parsed
    }

    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

function assertStatus(actual: number, expected: number, context: string) {
  if (actual !== expected) {
    throw new Error(`${context}: expected HTTP ${expected}, got ${actual}`)
  }
}

function assertRecord<TValue>(body: TValue, context: string): TJsonObject {
  const record = parseTJsonObject(body)
  if (record === undefined) {
    throw new Error(`${context}: expected JSON object`)
  }
  return record
}

function assertArray<TValue>(body: TValue, context: string): readonly TJsonValue[] {
  const items = parseTJsonArray(body)
  if (items === undefined) {
    throw new Error(`${context}: expected JSON array`)
  }
  return items
}

type SessionStatus = {
  type: string
}

type SmokeState = {
  baseUrl: string
  directory: string | undefined
  sessionId: string | undefined
  promptSessionId: string | undefined
}

const state: SmokeState = {
  baseUrl: readSmokeBaseUrl(),
  directory: undefined,
  sessionId: undefined,
  promptSessionId: undefined,
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function readSessionStatus(statusMap: TJsonObject, sessionId: string): SessionStatus | undefined {
  const entry = parseTJsonObject(statusMap[sessionId])
  const type = entry === undefined ? undefined : parseTString(entry.type)
  if (type === undefined) return undefined
  return { type }
}

function countCompletedToolParts(messages: readonly TJsonValue[]) {
  const toolNames: string[] = []

  for (const message of messages) {
    const record = parseTJsonObject(message)
    if (record === undefined) continue
    const info = parseTJsonObject(record.info)
    if (info === undefined || parseTString(info.role) !== "assistant") continue

    const parts = parseTJsonArray(record.parts)
    if (parts === undefined) continue

    for (const part of parts) {
      const partRecord = parseTJsonObject(part)
      if (partRecord === undefined || parseTString(partRecord.type) !== "tool") continue
      const stateValue = parseTJsonObject(partRecord.state)
      if (stateValue === undefined || parseTString(stateValue.status) !== "completed") continue
      const toolName = parseTString(partRecord.tool)
      if (toolName !== undefined && toolName.length > 0) {
        toolNames.push(toolName)
      }
    }
  }

  return {
    count: toolNames.length,
    toolNames,
  }
}

function assistantIncludesSmokeOk(messages: readonly TJsonValue[]) {
  for (const message of messages) {
    const record = parseTJsonObject(message)
    if (record === undefined) continue
    const info = parseTJsonObject(record.info)
    if (info === undefined || parseTString(info.role) !== "assistant") continue
    const parts = parseTJsonArray(record.parts)
    if (parts === undefined) continue
    for (const part of parts) {
      const partRecord = parseTJsonObject(part)
      if (partRecord === undefined || parseTString(partRecord.type) !== "text") continue
      const text = parseTString(partRecord.text)
      if (text !== undefined && text.includes("SMOKE_OK")) {
        return true
      }
    }
  }
  return false
}

async function waitForSessionIdle(input: { sessionId: string; directory: string }) {
  const deadline = Date.now() + PROMPT_WAIT_MS
  let activeStatusSeen = false
  let missingStatusPolls = 0

  while (Date.now() < deadline) {
    const { response, body } = await smokeFetch(`${API_PREFIX}/session/status`, {
      query: { directory: input.directory },
    })
    assertStatus(response.status, 200, "session.status (poll)")
    const statusMap = assertRecord(body, "session.status (poll)")
    const status = readSessionStatus(statusMap, input.sessionId)
    if (!status) {
      missingStatusPolls += 1
      if (activeStatusSeen || missingStatusPolls >= MISSING_STATUS_IDLE_POLL_COUNT) {
        return
      }
      await sleep(PROMPT_POLL_MS)
      continue
    }

    missingStatusPolls = 0
    if (status?.type === "idle") {
      return
    }
    activeStatusSeen = true
    await sleep(PROMPT_POLL_MS)
  }

  throw new Error(`session.prompt.tools: timed out after ${PROMPT_WAIT_MS}ms waiting for idle`)
}

async function fetchSessionMessages(input: { sessionId: string; directory: string }) {
  const { response, body } = await smokeFetch(`${API_PREFIX}/session/${input.sessionId}/message`, {
    query: { directory: input.directory },
  })
  assertStatus(response.status, 200, "session.messages (prompt)")
  return assertArray(body, "session.messages (prompt)")
}

const checks: TSmokeCheck[] = [
  {
    name: "buddy.healthz",
    run: async () => {
      const { response, body } = await smokeFetch(`${API_PREFIX}/healthz`)
      assertStatus(response.status, 200, "healthz")
      const record = assertRecord(body, "healthz")
      if (record.healthy !== true) {
        throw new Error("healthz: expected { healthy: true }")
      }
    },
  },
  {
    name: "opencode.health",
    run: async () => {
      const { response, body } = await smokeFetch(`${API_PREFIX}/health`)
      assertStatus(response.status, 200, "opencode health")
      const record = assertRecord(body, "opencode health")
      if (record.healthy !== true) {
        throw new Error("opencode health: expected { healthy: true }")
      }
      const version = parseTString(record.version)
      if (version === undefined || version.length === 0) {
        throw new Error("opencode health: missing version string")
      }
    },
  },
  {
    name: "open-projects.list",
    run: async () => {
      const { response, body } = await smokeFetch(`${API_PREFIX}/open-projects`)
      assertStatus(response.status, 200, "open-projects")
      const record = assertRecord(body, "open-projects")
      const directories = parseTStringArray(record.directories)
      if (directories === undefined || directories.length === 0) {
        throw new Error("open-projects: expected non-empty directories array")
      }
      const first = directories[0]
      if (first === undefined || first.trim().length === 0) {
        throw new Error("open-projects: first directory must be a non-empty string")
      }
      state.directory = first
    },
  },
  {
    name: "session.list",
    run: async () => {
      if (!state.directory) {
        throw new Error("session.list: missing directory from open-projects")
      }
      const { response, body } = await smokeFetch(`${API_PREFIX}/session`, {
        query: { directory: state.directory },
      })
      assertStatus(response.status, 200, "session.list")
      const sessions = assertArray(body, "session.list")
      const first = sessions[0]
      if (first !== undefined) {
        const record = assertRecord(first, "session.list[0]")
        const id = parseTString(record.id)
        if (id !== undefined && id.length > 0) {
          state.sessionId = id
        }
      }
    },
  },
  {
    name: "session.status",
    run: async () => {
      if (!state.directory) {
        throw new Error("session.status: missing directory")
      }
      const { response, body } = await smokeFetch(`${API_PREFIX}/session/status`, {
        query: { directory: state.directory },
      })
      assertStatus(response.status, 200, "session.status")
      assertRecord(body, "session.status")
    },
  },
  {
    name: "skills.list",
    run: async () => {
      if (!state.directory) {
        throw new Error("skills.list: missing directory")
      }
      const { response, body } = await smokeFetch(`${API_PREFIX}/skills`, {
        query: { directory: state.directory },
      })
      assertStatus(response.status, 200, "skills.list")
      const record = assertRecord(body, "skills.list")
      const installed = parseTJsonArray(record.installed)
      if (installed === undefined) {
        throw new Error("skills.list: expected installed[]")
      }
    },
  },
  {
    name: "command.list",
    run: async () => {
      if (!state.directory) {
        throw new Error("command.list: missing directory")
      }
      const { response, body } = await smokeFetch(`${API_PREFIX}/command`, {
        query: { directory: state.directory },
      })
      assertStatus(response.status, 200, "command.list")
      const commands = assertArray(body, "command.list")
      if (commands.length === 0) {
        throw new Error("command.list: expected at least one command")
      }
    },
  },
  {
    name: "session.messages",
    run: async () => {
      if (!state.directory) {
        throw new Error("session.messages: missing directory")
      }

      const { response, body } = await smokeFetch(`${API_PREFIX}/session`, {
        query: { directory: state.directory },
      })
      assertStatus(response.status, 200, "session.messages (list)")
      const sessions = assertArray(body, "session.messages (list)")
      const targets = sessions.slice(0, MAX_SESSIONS_TO_SCAN)

      if (targets.length === 0) {
        return
      }

      for (const entry of targets) {
        const record = assertRecord(entry, "session entry")
        const sessionId = parseTString(record.id)
        if (sessionId === undefined || sessionId.length === 0) continue

        const messagesResult = await smokeFetch(`${API_PREFIX}/session/${sessionId}/message`, {
          query: { directory: state.directory },
        })
        assertStatus(messagesResult.response.status, 200, `session.messages (${sessionId})`)
        assertArray(messagesResult.body, `session.messages (${sessionId})`)
      }
    },
  },
  {
    name: "session.create",
    run: async () => {
      if (!state.directory) {
        throw new Error("session.create: missing directory")
      }
      const { response, body } = await smokeFetch(`${API_PREFIX}/session`, {
        method: "POST",
        query: { directory: state.directory },
        headers: { "content-type": "application/json" },
        body: "{}",
      })
      assertStatus(response.status, 200, "session.create")
      const record = assertRecord(body, "session.create")
      const id = parseTString(record.id)
      if (id === undefined || id.length === 0) {
        throw new Error("session.create: missing session id")
      }
      state.promptSessionId = id
    },
  },
  {
    name: "session.prompt.tools",
    run: async () => {
      if (!state.directory) {
        throw new Error("session.prompt.tools: missing directory")
      }
      if (!state.promptSessionId) {
        throw new Error("session.prompt.tools: missing prompt session (run session.create first)")
      }

      const promptBody = JSON.stringify({
        parts: [{ type: "text", text: SMOKE_PROMPT_TEXT }],
      })

      const { response } = await smokeFetch(
        `${API_PREFIX}/session/${state.promptSessionId}/prompt_async`,
        {
          method: "POST",
          query: { directory: state.directory },
          headers: { "content-type": "application/json" },
          body: promptBody,
        },
      )
      assertStatus(response.status, 204, "session.prompt.tools (enqueue)")

      await waitForSessionIdle({
        sessionId: state.promptSessionId,
        directory: state.directory,
      })

      const messages = await fetchSessionMessages({
        sessionId: state.promptSessionId,
        directory: state.directory,
      })

      const { count, toolNames } = countCompletedToolParts(messages)
      if (count < MIN_COMPLETED_TOOL_PARTS) {
        throw new Error(
          `session.prompt.tools: expected at least ${MIN_COMPLETED_TOOL_PARTS} completed tool parts, got ${count} (${toolNames.join(", ") || "none"})`,
        )
      }

      if (!assistantIncludesSmokeOk(messages)) {
        throw new Error("session.prompt.tools: assistant reply did not include SMOKE_OK")
      }
    },
  },
]

async function runChecks() {
  console.log(`Buddy smoke → ${state.baseUrl}`)
  const auth = readBasicAuthHeader()
  console.log(`Auth: ${auth ? "basic (from env)" : "none"}`)

  const failures: { name: string; error: string }[] = []

  for (const check of checks) {
    const started = performance.now()
    try {
      await check.run()
      const ms = Math.round(performance.now() - started)
      console.log(`  ✓ ${check.name} (${ms}ms)`)
    } catch (error) {
      const ms = Math.round(performance.now() - started)
      const message = error instanceof Error ? error.message : String(error)
      console.log(`  ✗ ${check.name} (${ms}ms)`)
      console.log(`    ${message}`)
      failures.push({ name: check.name, error: message })
    }
  }

  console.log("")
  if (failures.length === 0) {
    const directory = state.directory ?? "(none)"
    const session = state.sessionId ?? "(none)"
    const promptSession = state.promptSessionId ?? "(none)"
    console.log(`OK — ${checks.length} checks passed`)
    console.log(`  directory: ${directory}`)
    console.log(`  sample session: ${session}`)
    console.log(`  prompt session: ${promptSession}`)
    return 0
  }

  console.log(`FAILED — ${failures.length}/${checks.length} checks`)
  for (const failure of failures) {
    console.log(`  - ${failure.name}: ${failure.error}`)
  }
  return 1
}

const exitCode = await runChecks()
process.exit(exitCode)

export { runChecks }
