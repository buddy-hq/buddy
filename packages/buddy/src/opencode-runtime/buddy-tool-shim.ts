import type { OpenCodeHost, SessionMessageInfo } from "@buddy/opencode-adapter/host"
import { ToolError, type ToolContext, type ToolInfo, type ToolResult } from "@buddy/opencode-adapter/plugin"
import { toBuddyMessage } from "@buddy/opencode-adapter/gateway/message"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import type { BuddyTool, BuddyToolExecuteResult } from "../learning/runtime/create-buddy-tool"
import { parseJsonObject, type TJsonObject } from "../learning/prompt/utils"
import { registerBuddyToolPresentationCatalog } from "./buddy-tool-presentation-catalog"
import { askBuddyToolPermission } from "./tool-permission"

export type BuddyToolRuntime = {
  directory: string
  getClient: () => Promise<OpenCodeHost>
  loadToolMessages?: (client: OpenCodeHost, directory: string, sessionID: string) => Promise<MessageWithParts[]>
}

function jsonMetadata<T>(value: T): TJsonObject {
  return parseJsonObject(JSON.parse(JSON.stringify(value))) ?? {}
}

function withTitle(metadata: TJsonObject, title: string | undefined): TJsonObject {
  if (title === undefined) return metadata
  return { ...metadata, buddy: { ...parseJsonObject(metadata.buddy), title } }
}

export async function loadBuddyToolMessages(
  client: OpenCodeHost,
  directory: string,
  sessionID: string,
): Promise<MessageWithParts[]> {
  const session = await client.session.get({ sessionID })
  const history: SessionMessageInfo[] = []
  let cursor: string | undefined
  do {
    const page = await client.message.list(cursor
      ? { sessionID, limit: 200, cursor }
      : { sessionID, limit: 200, order: "desc" })
    history.push(...page.data)
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  let parentID: string | undefined
  return history.toReversed().flatMap((message) => {
    if (message.type === "user") parentID = message.id
    const mapped = toBuddyMessage(message, { sessionID, directory, parentID })
    if (!mapped) return []
    if (mapped.info.role === "user") {
      return [{
        ...mapped,
        info: {
          ...mapped.info,
          agent: session.agent ?? "",
          model: { providerID: session.model?.providerID ?? "", modelID: session.model?.id ?? "" },
        },
      }]
    }
    return [mapped]
  })
}

function toolResult(tool: BuddyTool, result: BuddyToolExecuteResult): ToolResult {
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

export function buddyToolToToolInfo(tool: BuddyTool, runtime: BuddyToolRuntime): ToolInfo {
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
    async execute(rawArgs, context: ToolContext) {
      try {
        context.signal.throwIfAborted()
        const client = await runtime.getClient()
        const messages = await (runtime.loadToolMessages ?? loadBuddyToolMessages)(
          client, runtime.directory, context.sessionID,
        )
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

export async function allBuddyPluginTools(runtime: BuddyToolRuntime): Promise<ToolInfo[]> {
  const [{ allBuddyTools }, { getDynamicToolSearchTools }] = await Promise.all([
    import("../learning/runtime/feature-registry"), import("../learning/runtime/dynamic-tool-discovery"),
  ])
  const tools = [...allBuddyTools(), ...getDynamicToolSearchTools()]
  const seen = new Set<string>()
  for (const tool of tools) {
    if (seen.has(tool.id)) throw new Error(`Duplicate Buddy tool id "${tool.id}" in plugin export`)
    seen.add(tool.id)
  }
  registerBuddyToolPresentationCatalog(runtime.directory, tools)
  return tools.map((tool) => buddyToolToToolInfo(tool, runtime))
}
