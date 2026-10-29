import type { JsonValue } from "@buddy/agent-runtime/common"
import type { RuntimeTool, ToolApprovalRequest, ToolOutput } from "@buddy/agent-runtime/extension"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import { Permission } from "@opencode/schema/permission"
import { Error as ToolError, type ToolContext, type Info as ToolInfo, type Result as ToolResult } from "@opencode/plugin/promise/tool"
import z from "zod"
import { openCodeV1ImportCommandDisplay, openCodeV1ImportHasCommandDisplays, type OpenCodeHost, type OpenCodeEvent } from "../host"
import { listContextMessages } from "../gateway/message"
import { upstreamJson } from "../gateway/session"

export type ToolRuntime = {
  directory: string
  getClient: () => Promise<OpenCodeHost>
}

const jsonObjectSchema = z.record(z.string(), z.json())
type JsonMetadata = z.infer<typeof jsonObjectSchema>

function parseJsonObject<T>(value: T): JsonMetadata | undefined {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function jsonMetadata<T>(value: T): JsonMetadata {
  return parseJsonObject(JSON.parse(JSON.stringify(value))) ?? {}
}

function withTitle(metadata: JsonMetadata, title: string | undefined) {
  if (title === undefined) return metadata
  return Object.assign({}, metadata, { buddy: { ...parseJsonObject(metadata.buddy), title } })
}

export async function loadBuddyToolMessages(
  client: OpenCodeHost,
  directory: string,
  sessionID: string,
): Promise<MessageWithParts[]> {
  const session = await client.session.get({ sessionID })
  const items = await listContextMessages(client, { sessionID, directory, importedCommandDisplay: openCodeV1ImportHasCommandDisplays() ? openCodeV1ImportCommandDisplay : undefined })
  return items.map((mapped) => {
    if (mapped.info.role === "user") {
      return Object.assign({}, mapped, {
        info: {
          ...mapped.info,
          agent: session.agent ?? "",
          model: { providerID: session.model?.providerID ?? "", modelID: session.model?.id ?? "" },
        },
      })
    }
    return mapped
  })
}

function toolResult(tool: RuntimeTool, result: ToolOutput): ToolResult {
  const metadata = withTitle(jsonMetadata(result.metadata), result.title)
  if (tool.output &&
    (tool.output.maxLines === undefined || result.output.split("\n").length <= tool.output.maxLines) &&
    (tool.output.maxBytes === undefined || Buffer.byteLength(result.output) <= tool.output.maxBytes)) {
    metadata.truncated = false
  }
  return {
    content: [
      { type: "text", text: result.output },
      ...(result.attachments ?? []).map((attachment) => ({
        type: attachment.type, uri: attachment.url, mime: attachment.mime, name: attachment.filename,
      })),
    ],
    metadata,
  }
}

export function buddyToolToToolInfo(tool: RuntimeTool, runtime: ToolRuntime): ToolInfo {
  return {
    name: tool.id,
    description: tool.description,
    options: { codemode: false },
    input: {
      "~standard": {
        version: 1,
        vendor: "buddy",
        validate<T>(value: T) { return { value } },
        jsonSchema: { input: () => tool.jsonSchema, output: () => tool.jsonSchema },
      },
    },
    async execute(rawArgs: JsonValue, context: ToolContext) {
      try {
        context.signal.throwIfAborted()
        const client = await runtime.getClient()
        const messages = await loadBuddyToolMessages(client, runtime.directory, context.sessionID)
        const result = await tool.run(rawArgs, {
          directory: runtime.directory,
          sessionID: context.sessionID,
          messageID: context.messageID,
          agent: context.agent,
          callID: context.id,
          abort: context.signal,
          messages,
          metadata: (update) => context.progress(withTitle(jsonMetadata(update.metadata ?? {}), update.title)),
          ask: (request) => askBuddyToolPermission(client, {
            sessionID: context.sessionID, agent: context.agent, messageID: context.messageID,
            callID: context.id, request, signal: context.signal,
          }),
        })
        return toolResult(tool, result)
      } catch (cause) {
        if (context.signal.aborted || cause instanceof ToolError ||
          (cause instanceof DOMException && cause.name === "AbortError")) throw cause
        throw new ToolError({ message: cause instanceof Error ? cause.message : String(cause) })
      }
    },
  }
}

type PendingAsk = { sessionID: string; feedback?: string }
const pendingByClient = new WeakMap<OpenCodeHost, Map<string, PendingAsk>>()

export function withBuddyToolPermissionReplies(client: OpenCodeHost): OpenCodeHost {
  const pending = new Map<string, PendingAsk>()
  const wrapped: OpenCodeHost = {
    ...client,
    permission: {
      ...client.permission,
      async reply(input, options) {
        if (input.decision === "reject") {
          for (const ask of pending.values()) {
            if (ask.sessionID === input.sessionID) ask.feedback = input.message
          }
        }
        return client.permission.reply(input, options)
      },
    },
  }
  pendingByClient.set(wrapped, pending)
  return wrapped
}

type BuddyToolPermissionInput = {
  sessionID: string
  agent: string
  messageID: string
  callID: string
  request: ToolApprovalRequest
  signal: AbortSignal
}

function omitUndefinedMetadata(
  metadata: ToolApprovalRequest["metadata"],
) {
  const result: JsonMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) result[key] = upstreamJson(value)
  }
  return result
}

async function waitForEvent(
  iterator: AsyncIterator<OpenCodeEvent>,
  matches: (event: OpenCodeEvent) => boolean,
  signal: AbortSignal,
) {
  while (true) {
    signal.throwIfAborted()
    const next = await iterator.next()
    signal.throwIfAborted()
    if (next.done) throw new ToolError({ message: "Permission event stream closed before a reply" })
    if (matches(next.value)) return next.value
  }
}

export async function askBuddyToolPermission(
  client: OpenCodeHost,
  input: BuddyToolPermissionInput,
): Promise<void> {
  input.signal.throwIfAborted()
  const id = Permission.ID.create()
  const controller = new AbortController()
  const signal = AbortSignal.any([input.signal, controller.signal])
  const events = client.event.subscribe({ signal })[Symbol.asyncIterator]()
  const pending = pendingByClient.get(client)
  const ask: PendingAsk = { sessionID: input.sessionID }
  pending?.set(id, ask)
  let requested = false
  let settled = false
  try {
    await waitForEvent(events, (event) => event.type === "server.connected", signal)
    requested = true
    const result = await client.permission.create({
      id,
      sessionID: input.sessionID,
      action: input.request.permission,
      resources: input.request.patterns,
      save: input.request.always,
      metadata: omitUndefinedMetadata(input.request.metadata),
      source: { type: "tool", messageID: input.messageID, id: input.callID },
      agent: input.agent,
    })
    settled = result.effect !== "ask"
    signal.throwIfAborted()
    if (result.effect === "allow") return
    if (result.effect === "deny") {
      throw new ToolError({ message: `Permission denied: ${input.request.permission}` })
    }
    const event = await waitForEvent(
      events,
      (event) => event.type === "permission.replied" &&
        event.data.sessionID === input.sessionID && event.data.requestID === id,
      signal,
    )
    settled = true
    if (event.type !== "permission.replied" || event.data.reply !== "reject") return
    if (ask.feedback) throw new ToolError({ message: ask.feedback })
    await client.session.interrupt({ sessionID: input.sessionID })
    throw new ToolError({ message: "The user declined this tool call" })
  } finally {
    pending?.delete(id)
    controller.abort()
    await events.return?.()
    if (requested && !settled) {
      await client.permission.reply({
        sessionID: input.sessionID, requestID: id, decision: "reject",
      }).catch(() => undefined)
    }
  }
}
