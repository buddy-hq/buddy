import fs from "node:fs"
import { complete } from "@earendil-works/pi-ai"
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent"
import type {
  AgentSession,
  ExtensionFactory,
  ModelRegistry,
  SessionInfo as PiStoredSessionInfo,
} from "@earendil-works/pi-coding-agent"
import { readProjectConfig } from "../config/runtime/config-access"
import { REGISTERED_BUDDY_PERSONAS } from "../learning/personas/registry"
import { getDefaultBuddyPersona } from "../learning/personas/wiring/persona-profiles"
import { publishPiEvent } from "./event-bus"
import {
  createBuddyPiResourceLoader,
  getPiAuthStorage,
  getPiModelRegistry,
  resolveBuddyPiRuntimeResources,
  refreshPiModels,
} from "./host"
import { createBuddyPiUiContext } from "./ui-requests"
import { mapPiMessagesToBuddyMessages, mapPiSessionInfo } from "./mapper"
import { readPiSessionMetadata, updatePiSessionMetadata } from "./metadata-store"
import { piAgentDirectory, piSessionDirectory } from "./paths"
import { buddyProviderIDFromPi, piProviderCandidatesFromBuddy } from "./provider-aliases"
import { persistSessionLeafPosition, resolveRevertTarget } from "./session-revert"
import { buddySessionIDFromPi, piSessionIDFromBuddy } from "./session-ids"
import { PiSessionEventBridge } from "./session-event-bridge"
import { serializePiTranscriptMessages, textFromPiTranscriptMessage } from "./transcript"
import {
  buddyPiCustomTools,
  buddyPiToolNamesForSession,
  forwardedBuddyPiToolNamesForSubagent,
} from "./tools"
import { BUDDY_COMMANDS } from "./buddy-commands"
import type {
  BuddyMessageWithParts,
  PiAgentMessage,
  BuddyPromptPart,
  BuddySessionInfo,
  PiModel,
  PiPromptRequest,
  PiSessionStatus,
  PiTranscriptEntry,
} from "./types"
import { BUDDY_PROMPT_CUSTOM_TYPE } from "./contracts"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../learning/agent-execution/state/session-state"
import { resolveSessionRuntime } from "../learning/access/resolve-session-runtime"
import type { TeachingSessionState } from "../learning/shared/teaching-session-state"
import {
  captureWorkspaceSnapshot,
  createWorkspaceSnapshotKey,
  deleteWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
} from "./workspace-snapshot"

const SESSION_NOT_FOUND_ERROR = "Session not found"
const SESSION_CREATED_EVENT = "session.created"
const SESSION_UPDATED_EVENT = "session.updated"
const ACTIVE_SESSION_KEY_SEPARATOR = "\u001e"
const EMPTY_FIRST_MESSAGE = "(no messages)"
const BUDDY_SYSTEM_CONTEXT_OPEN = "<buddy_system_context>"
const BUDDY_SYSTEM_CONTEXT_CLOSE = "</buddy_system_context>"
const BUDDY_TURN_PRELUDE_CUSTOM_TYPE = "buddy-turn-prelude"
const PI_THINKING_LEVEL_OFF = "off"
const PI_THINKING_LEVEL_MINIMAL = "minimal"
const PI_THINKING_LEVEL_LOW = "low"
const PI_THINKING_LEVEL_MEDIUM = "medium"
const PI_THINKING_LEVEL_HIGH = "high"
const PI_THINKING_LEVEL_XHIGH = "xhigh"
const TITLE_GENERATION_PROMPT = `You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.

Follow all rules in <rules>
Use the <examples> so you know what a good title looks like.
Your output must be:
- A single line
- <=50 characters
- No explanations
</task>

<rules>
- you MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate a title for the conversation
- The title should NEVER include "summarizing" or "generating" when generating a title
- DO NOT SAY YOU CANNOT GENERATE A TITLE OR COMPLAIN ABOUT THE INPUT
- Always output something meaningful, even if the input is minimal.
- If the user message is short or conversational (e.g. "hello", "lol", "what's up", "hey"):
  -> create a title that reflects the user's tone or intent (such as Greeting, Quick check-in, Light chat, Intro message, etc.)
</rules>

<examples>
"debug 500 errors in production" -> Debugging production 500 errors
"refactor user service" -> Refactoring user service
"why is app.js failing" -> app.js failure investigation
"implement rate limiting" -> Rate limiting implementation
"how do I connect postgres to my API" -> Postgres API connection
"best practices for React hooks" -> React hooks best practices
"@src/auth.ts can you add refresh token support" -> Auth refresh token support
"@utils/parser.ts this is broken" -> Parser bug fix
"look at @config.json" -> Config review
"@App.tsx add dark mode toggle" -> Dark mode toggle in App
</examples>`
const TITLE_PROMPT_PREFIX = "Generate a title for this conversation:"
const TITLE_MAX_LENGTH = 50
const TITLE_PRIORITY = [
  "gpt-5-mini",
  "claude-haiku-4-5",
  "claude-haiku-4.5",
  "3-5-haiku",
  "3.5-haiku",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gpt-5-nano",
] as const
const GITHUB_COPILOT_TITLE_PRIORITY = ["gpt-5-mini", "claude-haiku-4.5"] as const
const OPENCODE_TITLE_PRIORITY = ["gpt-5-nano"] as const

type ActivePiSession = {
  directory: string
  defaultToolNames: readonly string[]
  session: AgentSession
  bridge: PiSessionEventBridge
  unsubscribe: () => void
  systemContext: PiSystemContextRef
}

type CreateActiveSessionOptions = {
  systemPrompt?: string
}

type PiSystemContextRef = {
  current?: string
}

type PiThinkingLevel = Parameters<AgentSession["setThinkingLevel"]>[0]

type SessionPatch = {
  title?: string
  time?: {
    archived?: number
  }
}

type ActiveSessionInfo = Pick<
  PiStoredSessionInfo,
  "id" | "cwd" | "path" | "name" | "created" | "modified" | "firstMessage"
> & {
  parentSessionPath?: string
}

type SessionSource = {
  session: ActiveSessionInfo
  model?: PiModel
}

type PromptContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }

export class PiSessionNotFoundError extends Error {
  constructor(sessionID: string) {
    super(`${SESSION_NOT_FOUND_ERROR}: ${sessionID}`)
    this.name = "PiSessionNotFoundError"
  }
}

export class PiSessionBusyError extends Error {
  constructor(sessionID: string) {
    super(`Session is busy: ${sessionID}`)
    this.name = "PiSessionBusyError"
  }
}

export class PiSessionRevertUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PiSessionRevertUnavailableError"
  }
}

function activeSessionKey(directory: string, sessionID: string) {
  return `${directory}${ACTIVE_SESSION_KEY_SEPARATOR}${sessionID}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readModelRequest(body: Record<string, unknown>) {
  const model = body.model
  if (typeof model === "string") {
    const separatorIndex = model.indexOf("/")
    if (separatorIndex > 0 && separatorIndex < model.length - 1) {
      return {
        providerID: model.slice(0, separatorIndex),
        modelID: model.slice(separatorIndex + 1),
      }
    }
    return undefined
  }
  if (!isRecord(model)) return undefined
  if (typeof model.providerID !== "string" || typeof model.modelID !== "string") {
    return undefined
  }
  return {
    providerID: model.providerID,
    modelID: model.modelID,
    ...(typeof model.variant === "string" ? { variant: model.variant } : {}),
  }
}

function textFromPromptPart(part: unknown): string | undefined {
  if (!isRecord(part)) return undefined
  if (part.type === "text" && typeof part.text === "string") return part.text
  if (part.type === "agent" && typeof part.name === "string") return `@${part.name}`
  if (part.type === "file" && typeof part.filename === "string") {
    return `[Attached file: ${part.filename}]`
  }
  return undefined
}

function imageContentFromDataUrl(url: string, mime: string): PromptContentBlock | undefined {
  const prefix = `data:${mime};base64,`
  if (!url.startsWith(prefix)) {
    return undefined
  }

  const data = url.slice(prefix.length)
  return data.length > 0
    ? {
        type: "image",
        data,
        mimeType: mime,
      }
    : undefined
}

function promptPartFromUnknown(part: unknown): BuddyPromptPart | undefined {
  if (!isRecord(part) || typeof part.type !== "string") return undefined
  if (part.type === "text" && typeof part.text === "string") {
    return {
      type: "text",
      text: part.text,
      ...(isRecord(part.metadata) ? { metadata: part.metadata } : {}),
    }
  }
  if (part.type === "file" && typeof part.mime === "string" && typeof part.url === "string") {
    return {
      type: "file",
      mime: part.mime,
      url: part.url,
      ...(typeof part.filename === "string" ? { filename: part.filename } : {}),
    }
  }
  if (part.type === "agent" && typeof part.name === "string") {
    return {
      type: "agent",
      name: part.name,
    }
  }
  return undefined
}

function promptPartsFromBody(body: Record<string, unknown>) {
  if (!Array.isArray(body.parts)) {
    return typeof body.content === "string" && body.content.trim().length > 0
      ? ([{ type: "text", text: body.content }] satisfies BuddyPromptPart[])
      : []
  }

  return body.parts
    .map(promptPartFromUnknown)
    .filter((part): part is BuddyPromptPart => part !== undefined)
}

function llmContentFromPromptParts(parts: readonly BuddyPromptPart[]) {
  const content: PromptContentBlock[] = []
  for (const part of parts) {
    if (part.type === "text") {
      content.push({
        type: "text",
        text: part.text,
      })
      continue
    }

    if (part.type === "agent") {
      content.push({
        type: "text",
        text: `@${part.name}`,
      })
      continue
    }

    if (part.type === "file") {
      const image = part.mime.startsWith("image/")
        ? imageContentFromDataUrl(part.url, part.mime)
        : undefined
      if (image) {
        content.push(image)
        continue
      }

      content.push({
        type: "text",
        text: `[Attached file: ${part.filename ?? part.url}]`,
      })
    }
  }

  return content
}

function contentFromPromptBody(body: Record<string, unknown>): string | undefined {
  if (typeof body.content === "string") return body.content
  if (!Array.isArray(body.parts)) return undefined
  const text = body.parts
    .map(textFromPromptPart)
    .filter((part): part is string => !!part)
    .join("\n\n")
  return text.length > 0 ? text : undefined
}

export function readPiPromptRequest(body: unknown): PiPromptRequest | undefined {
  if (!isRecord(body)) return undefined
  const parts = promptPartsFromBody(body)
  const content = contentFromPromptBody({
    ...body,
    parts,
  })
  if (!content || parts.length === 0) return undefined
  const llmContentBlocks = llmContentFromPromptParts(parts)
  const system =
    typeof body.system === "string" && body.system.trim() ? body.system.trim() : undefined
  const turnPrelude =
    typeof body.turnPrelude === "string" && body.turnPrelude.trim()
      ? body.turnPrelude.trim()
      : undefined
  return {
    content,
    llmContent: llmContentBlocks.length > 0 ? llmContentBlocks : content,
    parts,
    ...(system ? { system } : {}),
    ...(turnPrelude ? { turnPrelude } : {}),
    ...(typeof body.messageID === "string" ? { messageID: body.messageID } : {}),
    ...(typeof body.agent === "string" ? { agent: body.agent } : {}),
    ...(typeof body.variant === "string" ? { variant: body.variant } : {}),
    ...(readModelRequest(body) ? { model: readModelRequest(body) } : {}),
  }
}

export function readPiCommandPromptRequest(body: unknown): PiPromptRequest | undefined {
  if (!isRecord(body) || typeof body.command !== "string") return undefined
  const args =
    typeof body.arguments === "string" && body.arguments.trim() ? ` ${body.arguments}` : ""
  const builtInCommand = BUDDY_COMMANDS[body.command]
  const content = builtInCommand
    ? builtInCommand.expand(typeof body.arguments === "string" ? body.arguments : "")
    : `/${body.command}${args}`
  const model = readModelRequest(body)
  return {
    content,
    llmContent: content,
    parts: [
      {
        type: "text",
        text: content,
      },
    ],
    ...(typeof body.messageID === "string" ? { messageID: body.messageID } : {}),
    ...(typeof body.agent === "string" ? { agent: body.agent } : {}),
    ...(typeof body.variant === "string" ? { variant: body.variant } : {}),
    ...(model ? { model } : {}),
  }
}

function maybeModel(
  registry: ModelRegistry,
  request: PiPromptRequest | undefined,
): PiModel | undefined {
  if (!request?.model) return undefined
  for (const providerID of piProviderCandidatesFromBuddy(request.model.providerID)) {
    const model = registry.find(providerID, request.model.modelID)
    if (model) return model
  }
  return undefined
}

function isPiThinkingLevel(value: string): value is PiThinkingLevel {
  return (
    value === PI_THINKING_LEVEL_OFF ||
    value === PI_THINKING_LEVEL_MINIMAL ||
    value === PI_THINKING_LEVEL_LOW ||
    value === PI_THINKING_LEVEL_MEDIUM ||
    value === PI_THINKING_LEVEL_HIGH ||
    value === PI_THINKING_LEVEL_XHIGH
  )
}

function requestedThinkingLevel(request: PiPromptRequest): PiThinkingLevel | undefined {
  const variant = request.variant ?? request.model?.variant
  if (!variant || !isPiThinkingLevel(variant)) return undefined
  return variant
}

function titleModelPriority(provider: string) {
  if (provider.startsWith("opencode")) {
    return OPENCODE_TITLE_PRIORITY
  }
  if (provider.startsWith("github-copilot")) {
    return [...GITHUB_COPILOT_TITLE_PRIORITY, ...TITLE_PRIORITY]
  }
  return TITLE_PRIORITY
}

function firstRealUserPrompt(messages: readonly PiAgentMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user")
  if (userMessages.length !== 1) return undefined
  const firstUser = userMessages[0]
  const prompt = firstUser ? textFromPiTranscriptMessage(firstUser).trim() : ""
  return prompt.length > 0 ? prompt : undefined
}

function cleanGeneratedTitle(value: string) {
  const firstLine = value
    .replace(/<think>[\s\S]*?<\/think>\s*/gu, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return undefined

  const normalized = firstLine.replace(/^["'`]+|["'`]+$/gu, "").trim()
  if (!normalized) return undefined
  return normalized.length > TITLE_MAX_LENGTH
    ? `${normalized.slice(0, TITLE_MAX_LENGTH - 3).trimEnd()}...`
    : normalized
}

function textFromAssistantResponse(value: Awaited<ReturnType<typeof complete>>) {
  return value.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
}

function activeSessionInfo(input: ActivePiSession): ActiveSessionInfo {
  const header = input.session.sessionManager.getHeader()
  const messages = input.session.messages
  const firstMessage = messages
    .map(textFromPiTranscriptMessage)
    .find((text) => text.trim().length > 0)
  const created = header?.timestamp ? new Date(header.timestamp) : new Date()
  return {
    id: input.session.sessionId,
    cwd: input.directory,
    path: input.session.sessionFile ?? "",
    name: input.session.sessionName,
    created,
    modified: new Date(),
    firstMessage: firstMessage ?? EMPTY_FIRST_MESSAGE,
    ...(header?.parentSession ? { parentSessionPath: header.parentSession } : {}),
  }
}

function sessionNotFoundResponse(error: unknown) {
  return error instanceof PiSessionNotFoundError
    ? Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
    : undefined
}

function sessionBusyResponse(error: unknown) {
  return error instanceof PiSessionBusyError
    ? Response.json({ error: error.message }, { status: 409 })
    : undefined
}

function sessionRevertUnavailableResponse(error: unknown) {
  return error instanceof PiSessionRevertUnavailableError
    ? Response.json({ error: error.message }, { status: 409 })
    : undefined
}

function buddySystemContext(system: string) {
  return `${BUDDY_SYSTEM_CONTEXT_OPEN}\n${system}\n${BUDDY_SYSTEM_CONTEXT_CLOSE}`
}

function systemPromptWithBuddyContext(baseSystemPrompt: string, system: string | undefined) {
  if (!system) return baseSystemPrompt
  return `${baseSystemPrompt}\n\n${buddySystemContext(system)}`
}

function captureFullSystemPrompt(input: {
  directory: string
  sessionID: string
  systemPrompt: string
}) {
  const state = readTeachingSessionState(input.directory, input.sessionID)
  if (!state) return
  const nextHistory =
    state.llmOutboundHistory && state.llmOutboundHistory.length > 0
      ? [
          ...state.llmOutboundHistory.slice(0, -1),
          {
            ...state.llmOutboundHistory[state.llmOutboundHistory.length - 1]!,
            fullSystemPrompt: input.systemPrompt,
          },
        ]
      : state.llmOutboundHistory
  writeTeachingSessionState(input.directory, {
    ...state,
    ...(state.lastLlmOutbound
      ? {
          lastLlmOutbound: {
            ...state.lastLlmOutbound,
            fullSystemPrompt: input.systemPrompt,
          },
        }
      : {}),
    ...(nextHistory ? { llmOutboundHistory: nextHistory } : {}),
  })
}

function buddySystemContextExtension(input: {
  directory: string
  sessionID: string
  systemContext: PiSystemContextRef
}): ExtensionFactory {
  return (pi) => {
    pi.on("before_agent_start", (event) => ({
      systemPrompt: (() => {
        const next = systemPromptWithBuddyContext(event.systemPrompt, input.systemContext.current)
        captureFullSystemPrompt({
          directory: input.directory,
          sessionID: input.sessionID,
          systemPrompt: next,
        })
        return next
      })(),
    }))
  }
}

function lastAssistantOutput(messages: BuddyMessageWithParts[]) {
  const assistant = messages.findLast((message) => message.info.role === "assistant")
  if (!assistant) return ""
  return assistant.parts
    .filter(
      (part): part is Extract<BuddyMessageWithParts["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function buddyModelRequestFromPiModel(model: PiModel | undefined) {
  if (!model) return undefined
  return {
    providerID: buddyProviderIDFromPi(model.provider),
    modelID: model.id,
  }
}

function promptMessageDetails(input: { request: PiPromptRequest; session: AgentSession }) {
  return {
    kind: BUDDY_PROMPT_CUSTOM_TYPE,
    parts: input.request.parts,
    ...(input.request.agent ? { agent: input.request.agent } : {}),
    ...(input.request.messageID ? { messageID: input.request.messageID } : {}),
    ...(input.session.model
      ? {
          model: {
            providerID: buddyProviderIDFromPi(input.session.model.provider),
            modelID: input.session.model.id,
            ...(input.session.thinkingLevel ? { variant: input.session.thinkingLevel } : {}),
          },
        }
      : {}),
  }
}

function sessionToolNames(defaultToolNames: readonly string[], toolNames: readonly string[]) {
  return [...new Set([...defaultToolNames, ...toolNames])]
}

export class PiRuntime {
  private activeSessions = new Map<string, ActivePiSession>()
  private busySessionIDs = new Set<string>()

  getAuthStorage() {
    return getPiAuthStorage()
  }

  getModelRegistry() {
    return getPiModelRegistry()
  }

  refreshModels() {
    refreshPiModels()
  }

  private async listSessionSources(directory: string) {
    const stored = await SessionManager.list(directory, piSessionDirectory(directory))
    const sources: SessionSource[] = stored.map((session) => ({
      session: {
        id: session.id,
        cwd: session.cwd,
        path: session.path,
        name: session.name,
        created: session.created,
        modified: session.modified,
        firstMessage: session.firstMessage,
        ...(session.parentSessionPath ? { parentSessionPath: session.parentSessionPath } : {}),
      } satisfies ActiveSessionInfo,
      model: undefined as PiModel | undefined,
    }))

    for (const active of this.activeSessions.values()) {
      if (active.directory !== directory) continue
      const next = {
        session: activeSessionInfo(active),
        model: active.session.model,
      }
      const index = sources.findIndex((source) => source.session.id === next.session.id)
      if (index === -1) {
        sources.push(next)
        continue
      }
      sources[index] = next
    }

    return sources
  }

  private mapSessionSources(directory: string, sources: SessionSource[]) {
    const parentIDsByPath = new Map<string, string>()
    for (const source of sources) {
      if (!source.session.path) continue
      parentIDsByPath.set(source.session.path, buddySessionIDFromPi(source.session.id))
    }

    return sources.map((source) =>
      mapPiSessionInfo({
        directory,
        session: source.session,
        metadata: readPiSessionMetadata({ directory, sessionID: source.session.id }),
        ...(source.model ? { model: source.model } : {}),
        ...(source.session.parentSessionPath
          ? { parentID: parentIDsByPath.get(source.session.parentSessionPath) }
          : {}),
      }),
    )
  }

  private async mappedSessionInfo(directory: string, sessionID: string) {
    const sources = await this.listSessionSources(directory)
    const mapped = this.mapSessionSources(directory, sources)
    const info = mapped.find(
      (item) => item.id === buddySessionIDFromPi(piSessionIDFromBuddy(sessionID)),
    )
    if (!info) {
      throw new PiSessionNotFoundError(sessionID)
    }
    return info
  }

  private resolveTitleModel(input: { registry: ModelRegistry; sessionModel: PiModel | undefined }) {
    const sessionModel = input.sessionModel
    if (!sessionModel) return undefined

    const available = input.registry
      .getAvailable()
      .filter((model) => model.provider === sessionModel.provider)

    for (const needle of titleModelPriority(sessionModel.provider)) {
      const match = available.find((model) => model.id.includes(needle))
      if (match) return match
    }

    return input.registry.hasConfiguredAuth(sessionModel) ? sessionModel : available[0]
  }

  private async completeTitleGeneration(input: {
    registry: ModelRegistry
    model: PiModel
    prompt: string
  }) {
    const auth = await input.registry.getApiKeyAndHeaders(input.model)
    if (!auth.ok) return undefined

    const response = await complete(
      input.model,
      {
        systemPrompt: TITLE_GENERATION_PROMPT,
        messages: [
          {
            role: "user",
            content: `${TITLE_PROMPT_PREFIX}\n${input.prompt}`,
            timestamp: Date.now(),
          },
        ],
      },
      {
        ...(auth.apiKey ? { apiKey: auth.apiKey } : {}),
        ...(auth.headers ? { headers: auth.headers } : {}),
        temperature: 0.5,
        maxTokens: TITLE_MAX_LENGTH,
      },
    )

    return cleanGeneratedTitle(textFromAssistantResponse(response))
  }

  private async maybeGenerateSessionTitle(active: ActivePiSession) {
    const existingTitle = active.session.sessionName?.trim()
    if (existingTitle) return undefined

    const header = active.session.sessionManager.getHeader()
    if (header?.parentSession) return undefined

    const prompt = firstRealUserPrompt(active.session.messages)
    if (!prompt) return undefined

    const registry = this.getModelRegistry()
    const model = this.resolveTitleModel({
      registry,
      sessionModel: active.session.model,
    })
    if (!model) return undefined

    const title = await this.completeTitleGeneration({
      registry,
      model,
      prompt,
    })
    if (!title) return undefined

    const piSessionID = active.session.sessionId
    updatePiSessionMetadata({
      directory: active.directory,
      sessionID: piSessionID,
      patch: {
        title,
      },
    })
    active.session.setSessionName(title)
    return this.mappedSessionInfo(active.directory, piSessionID)
  }

  async listSessions(directory: string): Promise<BuddySessionInfo[]> {
    const sources = await this.listSessionSources(directory)
    return this.mapSessionSources(directory, sources).toSorted(
      (left, right) => right.time.updated - left.time.updated,
    )
  }

  async createSession(directory: string, request?: PiPromptRequest): Promise<BuddySessionInfo> {
    const manager = SessionManager.create(directory, piSessionDirectory(directory))
    const active = await this.createActiveSession(directory, manager, request)
    this.persistEmptySession(active)
    const info = await this.mappedSessionInfo(directory, active.session.sessionId)
    this.publishSessionEvent(directory, SESSION_CREATED_EVENT, info)
    return info
  }

  async getSessionInfo(directory: string, sessionID: string): Promise<BuddySessionInfo> {
    return this.mappedSessionInfo(directory, sessionID)
  }

  async patchSession(directory: string, sessionID: string, patch: SessionPatch) {
    const active = await this.ensureActiveSession(directory, sessionID, undefined)
    const piSessionID = active.session.sessionId
    updatePiSessionMetadata({
      directory,
      sessionID: piSessionID,
      patch: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.time?.archived !== undefined ? { archived: patch.time.archived } : {}),
      },
    })

    if (patch.title !== undefined) {
      active.session.setSessionName(patch.title)
    }

    const info = await this.mappedSessionInfo(directory, piSessionID)
    this.publishSessionEvent(directory, SESSION_UPDATED_EVENT, info)
    return info
  }

  async listMessages(directory: string, sessionID: string): Promise<BuddyMessageWithParts[]> {
    const piSessionID = piSessionIDFromBuddy(sessionID)
    const buddySessionID = buddySessionIDFromPi(piSessionID)
    const active = this.activeSessions.get(activeSessionKey(directory, piSessionID))
    if (active) {
      return mapPiMessagesToBuddyMessages({
        sessionID: buddySessionID,
        directory,
        messages: active.session.messages,
        model: active.session.model,
        variant: active.session.thinkingLevel,
      })
    }

    const manager = await this.openStoredSession(directory, piSessionID)
    return mapPiMessagesToBuddyMessages({
      sessionID: buddySessionID,
      directory,
      messages: manager.buildSessionContext().messages,
    })
  }

  async listTranscriptMessages(directory: string, sessionID: string): Promise<PiTranscriptEntry[]> {
    const piSessionID = piSessionIDFromBuddy(sessionID)
    const buddySessionID = buddySessionIDFromPi(piSessionID)
    const active = this.activeSessions.get(activeSessionKey(directory, piSessionID))
    if (active) {
      return serializePiTranscriptMessages({
        sessionID: buddySessionID,
        messages: active.session.messages,
      })
    }

    const manager = await this.openStoredSession(directory, piSessionID)
    return serializePiTranscriptMessages({
      sessionID: buddySessionID,
      messages: manager.buildSessionContext().messages,
    })
  }

  getStatus(directory: string): Record<string, PiSessionStatus> {
    const status: Record<string, PiSessionStatus> = {}
    for (const sessionID of this.busySessionIDs) {
      const active = this.activeSessions.get(activeSessionKey(directory, sessionID))
      if (active?.directory === directory) {
        status[buddySessionIDFromPi(sessionID)] = { type: "busy" }
      }
    }
    return status
  }

  private syncActiveSessionMessages(active: ActivePiSession) {
    active.session.agent.state.messages = active.session.sessionManager.buildSessionContext().messages
  }

  private async clearSessionRevertState(input: {
    directory: string
    piSessionID: string
    deleteSnapshot: boolean
  }) {
    const metadata = readPiSessionMetadata({
      directory: input.directory,
      sessionID: input.piSessionID,
    })
    const workspaceSnapshotKey = metadata?.revertState?.workspaceSnapshotKey

    updatePiSessionMetadata({
      directory: input.directory,
      sessionID: input.piSessionID,
      patch: {
        revert: undefined,
        revertState: undefined,
      },
    })

    if (input.deleteSnapshot && workspaceSnapshotKey) {
      await deleteWorkspaceSnapshot({
        directory: input.directory,
        sessionID: input.piSessionID,
        snapshotKey: workspaceSnapshotKey,
      }).catch(() => undefined)
    }
  }

  private async prepareTurnWorkspaceSnapshot(input: {
    active: ActivePiSession
    directory: string
    request: PiPromptRequest
  }) {
    const piSessionID = input.active.session.sessionId
    const existingMetadata = readPiSessionMetadata({
      directory: input.directory,
      sessionID: piSessionID,
    })

    if (existingMetadata?.revert) {
      await this.clearSessionRevertState({
        directory: input.directory,
        piSessionID,
        deleteSnapshot: true,
      })
    }

    if (!input.request.messageID) {
      return undefined
    }

    await captureWorkspaceSnapshot({
      directory: input.directory,
      sessionID: piSessionID,
      snapshotKey: input.request.messageID,
    })

    return input.request.messageID
  }

  async promptAsync(
    directory: string,
    sessionID: string,
    request: PiPromptRequest,
    options?: { refreshTools?: boolean },
  ) {
    const active = await this.ensureActiveSession(directory, sessionID, request)
    const piSessionID = active.session.sessionId
    const snapshotKey = await this.prepareTurnWorkspaceSnapshot({
      active,
      directory,
      request,
    })
    if (options?.refreshTools !== false) {
      this.refreshSessionTools(active)
    }
    await this.applyRequestedModel(active.session, request)
    this.applyRequestedThinkingLevel(active.session, request)
    active.systemContext.current = request.system

    if (active.session.isStreaming) {
      try {
        await this.injectTurnPrelude(active.session, request, "followUp")
        await active.session.sendCustomMessage(
          {
            customType: BUDDY_PROMPT_CUSTOM_TYPE,
            content: request.llmContent,
            display: true,
            details: promptMessageDetails({ request, session: active.session }),
          },
          { deliverAs: "followUp" },
        )
        return
      } finally {
        active.systemContext.current = undefined
      }
    }

    try {
      this.busySessionIDs.add(piSessionID)
      active.bridge.handle({ type: "agent_start" })
      this.removeEmptySessionHeader(active)
      await this.injectTurnPrelude(active.session, request)
      active.session
        .sendCustomMessage(
          {
            customType: BUDDY_PROMPT_CUSTOM_TYPE,
            content: request.llmContent,
            display: true,
            details: promptMessageDetails({ request, session: active.session }),
          },
          { triggerTurn: true },
        )
        .then(async () => {
          const updated = await this.maybeGenerateSessionTitle(active)
          if (updated) {
            this.publishSessionEvent(directory, SESSION_UPDATED_EVENT, updated)
          }
        })
        .catch((error) => {
          active.bridge.publishError(error)
        })
        .finally(() => {
          active.systemContext.current = undefined
          this.busySessionIDs.delete(piSessionID)
          active.bridge.publishIdle()
        })
    } catch (error) {
      if (snapshotKey) {
        await deleteWorkspaceSnapshot({
          directory,
          sessionID: piSessionID,
          snapshotKey,
        }).catch(() => undefined)
      }
      throw error
    }
  }

  async revertSession(
    directory: string,
    sessionID: string,
    input: {
      messageID: string
      partID?: string
    },
  ): Promise<BuddySessionInfo> {
    const active = await this.ensureActiveSession(directory, sessionID, undefined)
    if (active.session.isStreaming) {
      throw new PiSessionBusyError(sessionID)
    }

    const piSessionID = active.session.sessionId
    const metadata =
      readPiSessionMetadata({
        directory,
        sessionID: piSessionID,
      }) ?? {}
    const originalLeafId = metadata.revertState?.originalLeafId ?? active.session.sessionManager.getLeafId()
    const restoreSnapshotKey =
      metadata.revertState?.workspaceSnapshotKey ?? createWorkspaceSnapshotKey()
    const target = resolveRevertTarget({
      messageID: input.messageID,
      sessionManager: active.session.sessionManager,
    })

    if (target.entry.type !== "custom_message" && target.entry.type !== "message") {
      throw new PiSessionRevertUnavailableError("Session revert only supports user turns.")
    }

    if (!metadata.revertState?.workspaceSnapshotKey) {
      await captureWorkspaceSnapshot({
        directory,
        sessionID: piSessionID,
        snapshotKey: restoreSnapshotKey,
      })
    }

    try {
      await restoreWorkspaceSnapshot({
        directory,
        sessionID: piSessionID,
        snapshotKey: target.workspaceSnapshotKey,
      })
    } catch (error) {
      if (!metadata.revertState?.workspaceSnapshotKey) {
        await deleteWorkspaceSnapshot({
          directory,
          sessionID: piSessionID,
          snapshotKey: restoreSnapshotKey,
        }).catch(() => undefined)
      }
      throw new PiSessionRevertUnavailableError(
        `Session revert is unavailable for message ${input.messageID}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    persistSessionLeafPosition({
      sessionManager: active.session.sessionManager,
      targetLeafId: target.targetLeafId,
      reverted: true,
    })
    this.syncActiveSessionMessages(active)

    updatePiSessionMetadata({
      directory,
      sessionID: piSessionID,
      patch: {
        revert: {
          messageID: input.messageID,
          ...(input.partID ? { partID: input.partID } : {}),
        },
        revertState: {
          originalLeafId,
          workspaceSnapshotKey: restoreSnapshotKey,
        },
      },
    })

    const info = await this.mappedSessionInfo(directory, piSessionID)
    this.publishSessionEvent(directory, SESSION_UPDATED_EVENT, info)
    return info
  }

  async unrevertSession(directory: string, sessionID: string): Promise<BuddySessionInfo> {
    const active = await this.ensureActiveSession(directory, sessionID, undefined)
    if (active.session.isStreaming) {
      throw new PiSessionBusyError(sessionID)
    }

    const piSessionID = active.session.sessionId
    const metadata = readPiSessionMetadata({
      directory,
      sessionID: piSessionID,
    })

    if (!metadata?.revertState?.workspaceSnapshotKey) {
      return this.mappedSessionInfo(directory, piSessionID)
    }

    await restoreWorkspaceSnapshot({
      directory,
      sessionID: piSessionID,
      snapshotKey: metadata.revertState.workspaceSnapshotKey,
    }).catch((error) => {
      throw new PiSessionRevertUnavailableError(
        `Session restore is unavailable for ${sessionID}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })

    persistSessionLeafPosition({
      sessionManager: active.session.sessionManager,
      targetLeafId: metadata.revertState.originalLeafId ?? null,
      reverted: false,
    })
    this.syncActiveSessionMessages(active)
    await this.clearSessionRevertState({
      directory,
      piSessionID,
      deleteSnapshot: true,
    })

    const info = await this.mappedSessionInfo(directory, piSessionID)
    this.publishSessionEvent(directory, SESSION_UPDATED_EVENT, info)
    return info
  }

  async prompt(
    directory: string,
    sessionID: string,
    request: PiPromptRequest,
    options?: { refreshTools?: boolean },
  ) {
    const active = await this.ensureActiveSession(directory, sessionID, request)
    const snapshotKey = await this.prepareTurnWorkspaceSnapshot({
      active,
      directory,
      request,
    })
    const buddySessionID = buddySessionIDFromPi(active.session.sessionId)
    if (options?.refreshTools !== false) {
      this.refreshSessionTools(active)
    }
    await this.applyRequestedModel(active.session, request)
    this.applyRequestedThinkingLevel(active.session, request)
    active.systemContext.current = request.system
    this.busySessionIDs.add(active.session.sessionId)
    this.removeEmptySessionHeader(active)
    try {
      await this.injectTurnPrelude(active.session, request)
      await active.session.sendCustomMessage(
        {
          customType: BUDDY_PROMPT_CUSTOM_TYPE,
          content: request.llmContent,
          display: true,
          details: promptMessageDetails({ request, session: active.session }),
        },
        { triggerTurn: true },
      )

      const updated = await this.maybeGenerateSessionTitle(active)
      if (updated) {
        this.publishSessionEvent(directory, SESSION_UPDATED_EVENT, updated)
      }
    } catch (error) {
      if (snapshotKey) {
        await deleteWorkspaceSnapshot({
          directory,
          sessionID: active.session.sessionId,
          snapshotKey,
        }).catch(() => undefined)
      }
      active.bridge.publishError(error)
      throw error
    } finally {
      active.systemContext.current = undefined
      this.busySessionIDs.delete(active.session.sessionId)
    }

    const messages = await this.listTranscriptMessages(directory, buddySessionID)
    return messages.findLast((message) => {
      const role = message.message.role
      if (role === "user") return true
      return role === "custom" && message.message.customType === BUDDY_PROMPT_CUSTOM_TYPE
    })
  }

  async runSubagent(input: {
    directory: string
    parentSessionID?: string
    parentSessionFile?: string
    systemPrompt: string
    agent: string
    description: string
    task: string
    model?: PiModel
    onSessionCreated?: (sessionID: string) => void
  }) {
    const manager = SessionManager.create(input.directory, piSessionDirectory(input.directory))
    if (input.parentSessionFile) {
      manager.newSession({ parentSession: input.parentSessionFile })
    }

    const config = await readProjectConfig(input.directory)
    const persona = getDefaultBuddyPersona({
      defaultPersona: config.default_persona,
      overrides: config.personas,
    })
    const buddySubagentSessionID = buddySessionIDFromPi(manager.getSessionId())
    const parentBuddySessionID = input.parentSessionID
      ? buddySessionIDFromPi(input.parentSessionID)
      : undefined
    const parentState = parentBuddySessionID
      ? readTeachingSessionState(input.directory, parentBuddySessionID)
      : undefined

    const parentActiveTools = (() => {
      if (!input.parentSessionID) return []
      const activeParent = this.activeSessions.get(
        activeSessionKey(input.directory, input.parentSessionID),
      )
      if (activeParent) {
        return activeParent.session
          .getActiveToolNames()
          .filter((toolName) => !activeParent.defaultToolNames.includes(toolName))
      }
      if (parentState?.sessionRuntime?.access.tools) {
        return Object.entries(parentState.sessionRuntime.access.tools)
          .filter(([_, value]) => value === "allow")
          .map(([name]) => name)
      }
      return []
    })()

    const forwardedTools = forwardedBuddyPiToolNamesForSubagent({
      targetAgent: input.agent,
      parentToolNames: parentActiveTools,
      configuredToolToggles: config.tools,
      teachingWorkspaceState: parentState?.teachingWorkspaceState ?? "inactive",
    })

    const subagentState: TeachingSessionState = {
      sessionId: buddySubagentSessionID,
      persona: parentState?.persona ?? persona.id,
      currentSurface: parentState?.currentSurface ?? persona.defaultSurface,
      teachingWorkspaceState: parentState?.teachingWorkspaceState ?? "inactive",
      focusGoalIds: parentState?.focusGoalIds ?? [],
      sessionRuntime: {
        persona: parentState?.persona ?? persona.id,
        teachingWorkspaceState: parentState?.teachingWorkspaceState ?? "inactive",
        access: {
          tools: Object.fromEntries(forwardedTools.map((name) => [name, "allow"])),
          skills: parentState?.sessionRuntime?.access.skills ?? {},
          subagents: {},
        },
        ui: {
          visibleSurfaces: parentState?.sessionRuntime?.ui.visibleSurfaces ?? [],
          defaultSurface: parentState?.sessionRuntime?.ui.defaultSurface ?? persona.defaultSurface,
        },
      },
    }
    writeTeachingSessionState(input.directory, subagentState)

    const modelRequest = buddyModelRequestFromPiModel(input.model)
    const active = await this.createActiveSession(
      input.directory,
      manager,
      modelRequest
        ? {
            model: modelRequest,
            content: input.task,
            llmContent: input.task,
            parts: [
              {
                type: "text",
                text: input.task,
              },
            ],
          }
        : undefined,
      {
        systemPrompt: input.systemPrompt,
      },
    )

    active.session.setActiveToolsByName(sessionToolNames(active.defaultToolNames, forwardedTools))
    active.session.setSessionName(`${input.description} (@${input.agent} subagent)`)
    const info = await this.mappedSessionInfo(input.directory, active.session.sessionId)

    this.publishSessionEvent(input.directory, SESSION_CREATED_EVENT, info)
    input.onSessionCreated?.(info.id)

    await this.prompt(
      input.directory,
      info.id,
      {
        content: input.task,
        llmContent: input.task,
        parts: [
          {
            type: "text",
            text: input.task,
          },
        ],
        ...(modelRequest ? { model: modelRequest } : {}),
      },
      { refreshTools: false },
    )
    const messages = await this.listMessages(input.directory, info.id)
    return {
      sessionId: info.id,
      output: lastAssistantOutput(messages),
    }
  }

  async compact(directory: string, sessionID: string) {
    const active = await this.ensureActiveSession(directory, sessionID, undefined)
    await active.session.compact()
    return true
  }

  abort(directory: string, sessionID: string) {
    const piSessionID = piSessionIDFromBuddy(sessionID)
    const active = this.activeSessions.get(activeSessionKey(directory, piSessionID))
    if (!active || !active.session.isStreaming) return false
    active.session.abort()
    this.busySessionIDs.delete(piSessionID)
    return true
  }

  disposeAll() {
    for (const active of this.activeSessions.values()) {
      if (active.session.isStreaming) {
        active.session.abort()
      }
      active.unsubscribe()
    }
    this.activeSessions.clear()
    this.busySessionIDs.clear()
    return true
  }

  mapRouteError(error: unknown) {
    return (
      sessionNotFoundResponse(error) ??
      sessionBusyResponse(error) ??
      sessionRevertUnavailableResponse(error)
    )
  }

  private publishSessionEvent(directory: string, eventType: string, info: BuddySessionInfo) {
    publishPiEvent({
      directory,
      payload: {
        type: eventType,
        properties: {
          info,
        },
      },
    })
  }

  private async findStoredSession(directory: string, sessionID: string) {
    const sessions = await SessionManager.list(directory, piSessionDirectory(directory))
    return sessions.find((session) => session.id === sessionID)
  }

  private async openStoredSession(directory: string, sessionID: string) {
    const stored = await this.findStoredSession(directory, sessionID)
    if (!stored) throw new PiSessionNotFoundError(sessionID)
    return SessionManager.open(stored.path, piSessionDirectory(directory), directory)
  }

  private async ensureActiveSession(
    directory: string,
    sessionID: string,
    request: PiPromptRequest | undefined,
  ) {
    const piSessionID = piSessionIDFromBuddy(sessionID)
    const key = activeSessionKey(directory, piSessionID)
    const active = this.activeSessions.get(key)
    if (active) return active

    const manager = await this.openStoredSession(directory, piSessionID)
    return this.createActiveSession(directory, manager, request)
  }

  private async createActiveSession(
    directory: string,
    manager: SessionManager,
    request: PiPromptRequest | undefined,
    options?: CreateActiveSessionOptions,
  ): Promise<ActivePiSession> {
    const config = await readProjectConfig(directory)
    const persona = getDefaultBuddyPersona({
      defaultPersona: config.default_persona,
      overrides: config.personas,
    })
    const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
      (candidate) => candidate.id === persona.id,
    )
    if (!personaDefinition) {
      throw new Error(`Unknown Buddy persona "${persona.id}"`)
    }

    const buddySessionID = buddySessionIDFromPi(manager.getSessionId())
    let teachingState = readTeachingSessionState(directory, buddySessionID)
    if (!teachingState) {
      const sessionRuntime = resolveSessionRuntime({
        persona: {
          id: persona.id,
          features: personaDefinition.features,
          defaultSurface: persona.defaultSurface,
        },
        teachingWorkspaceState: "inactive",
        configuredToolToggles: config.tools,
      })

      teachingState = {
        sessionId: buddySessionID,
        persona: persona.id,
        currentSurface: persona.defaultSurface,
        teachingWorkspaceState: "inactive",
        sessionRuntime,
        focusGoalIds: [],
      }
      writeTeachingSessionState(directory, teachingState)
    }

    const registry = this.getModelRegistry()
    const model = maybeModel(registry, request)
    const systemContext: PiSystemContextRef = {}
    const resources = await resolveBuddyPiRuntimeResources(directory, options)
    const { resourceLoader, settingsManager } = await createBuddyPiResourceLoader({
      directory,
      resources,
      extensionFactories: [
        buddySystemContextExtension({
          directory,
          sessionID: buddySessionID,
          systemContext,
        }),
      ],
    })
    const toolSet = await buddyPiCustomTools(directory, {
      runSubagent: (input) => this.runSubagent(input),
    })
    const activeToolNames = sessionToolNames(
      toolSet.defaultToolNames,
      buddyPiToolNamesForSession(directory, buddySessionID),
    )
    const { session } = await createAgentSession({
      cwd: directory,
      agentDir: piAgentDirectory(),
      authStorage: this.getAuthStorage(),
      modelRegistry: registry,
      settingsManager,
      resourceLoader,
      sessionManager: manager,
      ...(model ? { model } : {}),
      tools: activeToolNames,
      customTools: toolSet.tools,
    })
    await session.bindExtensions({
      uiContext: createBuddyPiUiContext({
        directory,
        sessionID: buddySessionID,
      }),
    })

    let bridge: PiSessionEventBridge | undefined
    bridge = new PiSessionEventBridge({
      directory,
      session,
      onSessionUpdated: async () => {
        if (!bridge) return
        bridge.publishUpdatedSessionInfo(await this.getSessionInfo(directory, session.sessionId))
      },
    })
    const unsubscribe = session.subscribe(bridge.handle)
    const active: ActivePiSession = {
      directory,
      defaultToolNames: toolSet.defaultToolNames,
      session,
      bridge,
      unsubscribe,
      systemContext,
    }
    this.activeSessions.set(activeSessionKey(directory, session.sessionId), active)
    return active
  }

  private persistEmptySession(active: ActivePiSession) {
    if (active.session.messages.length > 0) return
    const sessionFile = active.session.sessionManager.getSessionFile()
    const header = active.session.sessionManager.getHeader()
    if (!sessionFile || !header || fs.existsSync(sessionFile)) return
    fs.writeFileSync(sessionFile, `${JSON.stringify(header)}\n`)
  }

  private removeEmptySessionHeader(active: ActivePiSession) {
    if (active.session.messages.length > 0) return
    const sessionFile = active.session.sessionManager.getSessionFile()
    if (!sessionFile || !fs.existsSync(sessionFile)) return
    fs.rmSync(sessionFile)
  }

  private async applyRequestedModel(session: AgentSession, request: PiPromptRequest) {
    const model = maybeModel(this.getModelRegistry(), request)
    if (!model) return
    if (session.model?.provider === model.provider && session.model.id === model.id) return
    await session.setModel(model)
  }

  private applyRequestedThinkingLevel(session: AgentSession, request: PiPromptRequest) {
    const thinkingLevel = requestedThinkingLevel(request)
    if (!thinkingLevel) return
    session.setThinkingLevel(thinkingLevel)
  }

  private async injectTurnPrelude(
    session: AgentSession,
    request: PiPromptRequest,
    deliverAs?: "followUp",
  ) {
    if (!request.turnPrelude) return
    await session.sendCustomMessage(
      {
        customType: BUDDY_TURN_PRELUDE_CUSTOM_TYPE,
        content: request.turnPrelude,
        display: false,
        details: {
          kind: BUDDY_TURN_PRELUDE_CUSTOM_TYPE,
        },
      },
      deliverAs ? { deliverAs } : { deliverAs: "nextTurn" },
    )
  }

  private refreshSessionTools(active: ActivePiSession) {
    active.session.setActiveToolsByName(
      sessionToolNames(
        active.defaultToolNames,
        buddyPiToolNamesForSession(
          active.directory,
          buddySessionIDFromPi(active.session.sessionId),
        ),
      ),
    )
  }

  syncSessionRuntimeTools(directory: string, buddySessionID: string) {
    const active = this.activeSessions.get(
      activeSessionKey(directory, piSessionIDFromBuddy(buddySessionID)),
    )
    if (!active) {
      return false
    }

    this.refreshSessionTools(active)
    return true
  }
}

export const piRuntime = new PiRuntime()
