import {
  ExtensionError,
  type ExtensionHooks,
  type SessionAccess,
} from "@buddy/agent-runtime/extension"
import {
  toBuddyPermissionRules,
  toSessionPermissionRules,
} from "@buddy/transcript-contract/permission-rules"
import { readPromptPresentation } from "@buddy/transcript-contract/prompt"
import { isAgentNotFoundError } from "@opencode/client"
import type { Context as PluginContext } from "@opencode/plugin/promise/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import z from "zod"
import type { OpenCodeHost, SessionMessageInfo } from "../host"
import { patchSessionMetadata } from "../session-metadata"

const toolInput = z.json().catch(null)

export function createPluginSessionAccess(ctx: PluginContext): SessionAccess {
  return {
    async get(sessionID) {
      const session = await ctx.session.get({ sessionID })
      return {
        id: session.id,
        parentID: session.parentID,
        agent: session.agent,
        metadata: session.metadata,
        rules: toBuddyPermissionRules(session.permissions ?? []),
      }
    },
    patchMetadata(sessionID, patch) {
      return patchSessionMetadata(ctx.session, sessionID, patch)
    },
    async setRules(sessionID, rules) {
      await ctx.session.update({ sessionID, permissions: toSessionPermissionRules(rules) })
    },
    async agentRules(agentID) {
      try {
        const agent = (
          await ctx.agent.get({ location: { directory: ctx.location.directory }, agentID })
        ).data
        return toBuddyPermissionRules(agent?.permissions ?? [])
      } catch (cause) {
        if (isAgentNotFoundError(cause)) return []
        throw cause
      }
    },
    async toolPermissions() {
      const catalog = await ctx.tool.list()
      return Object.fromEntries(
        catalog.map((tool) => [tool.name, tool.options?.permission ?? tool.name]),
      )
    },
  }
}

async function applyPromptPresentation(
  event: SessionContext,
  messages: readonly SessionMessageInfo[],
  client: Pick<OpenCodeHost, "message">,
): Promise<void> {
  const users = new Map(
    messages.flatMap((message) =>
      message.type === "user" ? [[message.id, message] as const] : [],
    ),
  )
  event.messages = event.messages.map((message) => {
    const user = message.id === undefined ? undefined : users.get(message.id)
    if (!user) return message
    const prompt = readPromptPresentation(user.metadata, user.text)
    if (!prompt?.segments.some((segment) => segment.ignored === true)) return message
    const text = prompt.segments
      .filter((segment) => segment.ignored !== true)
      .map((segment) => user.text.slice(segment.start, segment.end))
      .join("")
    const content = message.content.flatMap((part) =>
      part.type === "text" && part.text === user.text
        ? text
          ? [Object.assign({}, part, { text })]
          : []
        : [part],
    )
    return Object.assign({}, message, { content })
  })
  for (const message of messages.toReversed()) {
    if (message.type !== "user") continue
    const system = readPromptPresentation(message.metadata, message.text)?.system
    if (!system) continue
    event.system.push({ type: "text", text: system })
    return
  }
  if (!messages.some((message) => message.type === "compaction" && message.status === "completed"))
    return
  let cursor: string | undefined
  do {
    const page = await client.message.list({
      sessionID: event.sessionID,
      type: "user",
      limit: 200,
      ...(cursor ? { cursor } : { order: "desc" }),
    })
    for (const message of page.data) {
      if (message.type !== "user") continue
      const system = readPromptPresentation(message.metadata, message.text)?.system
      if (!system) continue
      event.system.push({ type: "text", text: system })
      return
    }
    cursor = page.cursor.next ?? undefined
  } while (cursor)
}

async function runHook<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    if (cause instanceof ExtensionError)
      throw new ToolError({ message: cause.message, error: cause.cause })
    throw cause
  }
}

type ExtensionHookContext = {
  readonly session: Pick<PluginContext["session"], "hook" | "context">
  readonly tool: Pick<PluginContext["tool"], "hook">
  readonly permission: Pick<PluginContext["permission"], "hook">
}

export async function registerExtensionHooks(
  ctx: ExtensionHookContext,
  hooks: ExtensionHooks,
  getClient: () => Promise<Pick<OpenCodeHost, "message">>,
): Promise<void> {
  const hydrate = (event: { readonly sessionID: string }) =>
    runHook(() => hooks.hydrate(event.sessionID))
  await ctx.session.hook("context", hydrate)
  await ctx.session.hook("compaction", (event) => runHook(() => hooks.compaction(event.sessionID)))
  await ctx.session.hook("generate", hydrate)
  await ctx.session.hook("prompt", (event) => runHook(() => hooks.prompt(event.sessionID)))
  await ctx.tool.hook("execute.before", (event) =>
    runHook(() =>
      hooks.beforeTool({
        tool: event.tool,
        sessionID: event.sessionID,
        input: toolInput.parse(event.input),
      }),
    ),
  )
  await ctx.session.hook("context", async (event) => {
    await applyPromptPresentation(
      event,
      await ctx.session.context({ sessionID: event.sessionID }),
      await getClient(),
    )
    const system = event.system
    const verbosity = event.options.textVerbosity
    const textVerbosity =
      verbosity === "low" || verbosity === "medium" || verbosity === "high" ? verbosity : undefined
    const update = await runHook(() =>
      hooks.context({
        sessionID: event.sessionID,
        agent: event.agent,
        system: system.map((part) => part.text),
        tools: Object.keys(event.tools),
        textVerbosity,
      }),
    )
    for (const name of update.hiddenTools ?? []) delete event.tools[name]
    if (update.textVerbosity !== textVerbosity) event.options.textVerbosity = update.textVerbosity
    event.system = system.flatMap((part, index) => {
      const text = update.system[index] ?? part.text
      return text === "" ? [] : [{ ...part, text }]
    })
  })
  await ctx.permission.hook("evaluate", async (event) => {
    if (event.effect === "deny") return
    try {
      event.effect = await hooks.permission({
        sessionID: event.sessionID,
        action: event.action,
        resources: event.resources,
        effect: event.effect,
      })
    } catch (cause) {
      console.error("Chat access permission hook failed", cause)
    }
  })
}
