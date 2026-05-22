import crypto from "node:crypto"
import "./opencode-environment"
import { Effect } from "effect"
import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Permission } from "@buddy/opencode-adapter/permission"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { ToolJsonSchema, type OpenCodeToolID } from "@buddy/opencode-adapter/tool"
import type { PiToolDefinition } from "../learning/runtime/create-buddy-tool"
import { typeboxSchemaFromJsonSchema } from "../learning/runtime/json-schema-typebox"
import { normalizeToolCallArgs } from "../learning/runtime/normalize-tool-call-args"
import { mergeToolResultMetadata } from "../learning/runtime/tool-result-metadata"
import { buildOpenCodeConfigOverlay, readProjectConfig } from "../config/runtime/opencode-sync"
import { directoryKey } from "./directory-key"
import { buddySessionIDFromPi } from "./session-ids"
import { executeUntilAbort, livePiMessageID, livePiSessionMessages } from "./live-tool-context"
import { mapPiMessagesToOpenCodeMessages } from "./opencode-messages"
import { requestBuddyPiPermission } from "./ui-requests"

const DEFAULT_TOOL_MODEL = {
  providerID: ProviderID.opencode,
  modelID: ModelID.make("claude-sonnet"),
} as const

const PATCH_TOOL_MODEL = {
  providerID: ProviderID.opencode,
  modelID: ModelID.make("gpt-5"),
} as const

const BRIDGED_OPENCODE_TOOLS: Record<OpenCodeToolID, boolean> = {
  apply_patch: true,
  edit: true,
  glob: true,
  grep: true,
  invalid: false,
  lsp: true,
  plan_exit: false,
  question: false,
  read: true,
  repo_clone: true,
  repo_overview: true,
  bash: true,
  skill: true,
  task: false,
  task_status: true,
  todowrite: true,
  webfetch: true,
  websearch: true,
  write: true,
}

export const DEFAULT_BRIDGED_OPENCODE_TOOL_NAMES = Object.entries(
  BRIDGED_OPENCODE_TOOLS,
).flatMap(([toolID, enabled]) => (enabled ? [toolID] : []))

type RuntimeTool = Awaited<ReturnType<typeof ToolRegistry.tools>>[number]

type OpenCodePiToolSet = {
  tools: PiToolDefinition[]
  defaultToolNames: string[]
}

type PermissionRule = {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

type OpenCodePermissionContext = {
  agentName: string
  ruleset: PermissionRule[]
}

const approvedRulesByDirectory = new Map<string, PermissionRule[]>()

function liveBuddySessionID(context: ExtensionContext | undefined) {
  return context
    ? buddySessionIDFromPi(context.sessionManager.getSessionId())
    : `ses_bridge_${crypto.randomUUID().replaceAll("-", "")}`
}

function liveBuddyMessageID(context: ExtensionContext | undefined) {
  return livePiMessageID(context)
}

async function withBuddyOpenCodeRuntime<T>(directory: string, fn: () => Promise<T>) {
  const config = await readProjectConfig(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })
  setConfigOverlay(directory, overlay)
  return OpenCodeInstance.provide({
    directory,
    fn,
  })
}

async function openCodeRuntimeTools(directory: string): Promise<RuntimeTool[]> {
  return withBuddyOpenCodeRuntime(directory, async () => {
    const [defaultTools, patchTools] = await Promise.all([
      ToolRegistry.tools(DEFAULT_TOOL_MODEL),
      ToolRegistry.tools(PATCH_TOOL_MODEL),
    ])
    const merged = new Map<string, RuntimeTool>()
    for (const tool of [...defaultTools, ...patchTools]) {
      merged.set(tool.id, tool)
    }
    return [...merged.values()].filter((tool) => {
      const id = tool.id as OpenCodeToolID
      return id in BRIDGED_OPENCODE_TOOLS && BRIDGED_OPENCODE_TOOLS[id] === true
    })
  })
}

async function openCodePermissionContext(directory: string): Promise<OpenCodePermissionContext> {
  return withBuddyOpenCodeRuntime(directory, async () => {
    const agentName = await OpenCodeAgent.defaultAgent()
    const agent = await OpenCodeAgent.get(agentName)
    return {
      agentName,
      ruleset: [...agent.permission],
    }
  })
}

function approvedRules(directory: string) {
  const key = directoryKey(directory)
  const existing = approvedRulesByDirectory.get(key)
  if (existing) return existing
  const created: PermissionRule[] = []
  approvedRulesByDirectory.set(key, created)
  return created
}

async function askOpenCodePermission(input: {
  directory: string
  sessionID: string
  messageID: string
  toolCallID: string
  ruleset: PermissionRule[]
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
  signal: AbortSignal
}) {
  const approved = approvedRules(input.directory)
  let needsPrompt = false

  for (const pattern of input.patterns) {
    const rule = Permission.evaluate(input.permission, pattern, input.ruleset, approved)
    if (rule.action === "deny") {
      throw new Permission.DeniedError({
        ruleset: input.ruleset.filter(
          (entry) => entry.permission === input.permission || entry.permission === "*",
        ),
      })
    }
    if (rule.action === "allow") continue
    needsPrompt = true
  }

  if (!needsPrompt) {
    return
  }

  const resolution = await requestBuddyPiPermission({
    directory: input.directory,
    sessionID: input.sessionID,
    permission: input.permission,
    patterns: input.patterns,
    always: input.always,
    metadata: input.metadata,
    tool: {
      messageID: input.messageID,
      callID: input.toolCallID,
    },
    options: {
      signal: input.signal,
    },
  })

  if (resolution.reply === "reject") {
    if (resolution.message?.trim()) {
      throw new Permission.CorrectedError({
        feedback: resolution.message.trim(),
      })
    }
    throw new Permission.RejectedError()
  }

  if (resolution.reply !== "always") {
    return
  }

  const approvals = approvedRules(input.directory)
  for (const pattern of input.always) {
    approvals.push({
      permission: input.permission,
      pattern,
      action: "allow",
    })
  }
}

function toPiToolResult(result: {
  output: string
  metadata: Record<string, unknown>
  attachments?: Array<{
    type: "file"
    mime: string
    url: string
    filename?: string
  }>
}): AgentToolResult<unknown> {
  const content: AgentToolResult<unknown>["content"] = [{ type: "text", text: result.output }]

  for (const attachment of result.attachments ?? []) {
    if (!attachment.mime.startsWith("image/")) continue
    const prefix = `data:${attachment.mime};base64,`
    if (!attachment.url.startsWith(prefix)) continue
    content.push({
      type: "image",
      data: attachment.url.slice(prefix.length),
      mimeType: attachment.mime,
    })
  }

  return {
    content,
    details: {
      ...mergeToolResultMetadata({
        title: "title" in result && typeof result.title === "string" ? result.title : undefined,
        metadata: result.metadata,
      }),
      ...(result.attachments?.length ? { attachments: result.attachments } : {}),
    },
  }
}

function toPiTool(tool: RuntimeTool, directory: string): PiToolDefinition {
  return {
    name: tool.id,
    label: tool.id,
    description: tool.description,
    promptSnippet: tool.description,
    parameters: typeboxSchemaFromJsonSchema(ToolJsonSchema.fromSchema(tool.parameters)),
    async execute(toolCallID, params, signal, onUpdate, context) {
      const abort = signal ?? new AbortController().signal
      const sessionID = liveBuddySessionID(context)
      const messageID = liveBuddyMessageID(context)
      const permissionContext = await openCodePermissionContext(directory)
      const messages = mapPiMessagesToOpenCodeMessages({
        sessionID,
        directory,
        messages: livePiSessionMessages(context),
        ...(context?.model ? { model: context.model } : {}),
      })

      const result = await executeUntilAbort(abort, () =>
        withBuddyOpenCodeRuntime(directory, async () =>
          tool.execute(normalizeToolCallArgs(params), {
            sessionID: SessionID.make(sessionID),
            messageID: MessageID.make(messageID),
            agent: permissionContext.agentName,
            abort,
            callID: toolCallID,
            messages,
            metadata(input) {
              return Effect.sync(() => {
                onUpdate?.({
                  content: [],
                  details: mergeToolResultMetadata({
                    title: input.title,
                    metadata: input.metadata,
                  }),
                })
              })
            },
            ask(input) {
              return Effect.tryPromise({
                try: () =>
                  askOpenCodePermission({
                    directory,
                    sessionID,
                    messageID,
                    toolCallID,
                    ruleset: permissionContext.ruleset,
                    permission: input.permission,
                    patterns: [...input.patterns],
                    always: [...input.always],
                    metadata: input.metadata,
                    signal: abort,
                  }),
                catch(error) {
                  return error instanceof Error ? error : new Error(String(error))
                },
              }).pipe(Effect.orDie)
            },
          }),
        ),
      )

      return toPiToolResult(result)
    },
  }
}

export async function buildOpenCodePiToolSet(directory: string): Promise<OpenCodePiToolSet> {
  const tools = (await openCodeRuntimeTools(directory)).map((tool) => toPiTool(tool, directory))
  return {
    tools,
    defaultToolNames: [...new Set(tools.map((tool) => tool.name))],
  }
}
