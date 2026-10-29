import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import type {
  OpenCodeClient,
  SessionPromptInput,
  SessionCommandInput,
  ModelRef,
} from "@opencode/client"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import { readCommandDisplay } from "@buddy/transcript-contract/prompt"
import type { Session } from "@buddy/transcript-contract/session"
import type { SessionClient, EventClient } from "./client"
import {
  observeSessionExecution,
  SessionExecutionWaitError,
  withdrawUndeliveredInput,
  type ExecutionOutcome,
} from "./execution"
import { getMessage, toBuddyMessage, type MessageContext } from "./message"
import { getSession } from "./session"
import { hiddenRuntimeCommandNames } from "./command"
import { isSessionNotFound, sessionErrorStatus } from "./errors"

type WriteClient = SessionClient & Pick<EventClient, "event">
type Selection = { readonly agent?: string; readonly model?: ModelRef }
export type PromptInput = SessionPromptInput & Selection
export type CommandInput = SessionCommandInput & Selection

export class SessionWriteError extends Error {
  readonly _tag = "SessionWriteError"
  constructor(
    readonly status: number,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

const CommandNotFound = Schema.Struct({ _tag: Schema.Literal("CommandNotFoundError") })

export type SessionWriteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SessionWriteError }
const admissions = new WeakMap<WriteClient, Map<string, Promise<void>>>()

async function admit<T>(client: WriteClient, sessionID: string, run: () => Promise<T>): Promise<T> {
  let sessions = admissions.get(client)
  if (!sessions) {
    sessions = new Map()
    admissions.set(client, sessions)
  }
  const previous = sessions.get(sessionID)
  const done = Promise.withResolvers<void>()
  sessions.set(sessionID, done.promise)
  await previous
  try {
    return await run()
  } finally {
    done.resolve()
    if (sessions.get(sessionID) === done.promise) sessions.delete(sessionID)
  }
}

function failure(cause: unknown) {
  if (cause instanceof SessionWriteError) return { ok: false, error: cause } as const
  if (cause instanceof SessionExecutionWaitError)
    return {
      ok: false,
      error: new SessionWriteError(
        cause.reason === "disconnected" ? 503 : 409,
        cause.message,
        cause,
      ),
    } as const
  return {
    ok: false,
    error: new SessionWriteError(
      sessionErrorStatus(cause),
      cause instanceof Error ? cause.message : "Session request failed",
      cause,
    ),
  } as const
}

async function select(client: WriteClient, input: Selection & { readonly sessionID: string }) {
  const current = await client.session.get({ sessionID: input.sessionID })
  if (input.agent && input.agent !== current.agent)
    await client.session.switchAgent({ sessionID: input.sessionID, agent: input.agent })
  if (
    input.model &&
    (input.model.providerID !== current.model?.providerID ||
      input.model.id !== current.model?.id ||
      input.model.variant !== current.model?.variant)
  ) {
    await client.session.switchModel({ sessionID: input.sessionID, model: input.model })
  }
  return { agent: input.agent ?? current.agent, model: input.model ?? current.model }
}

async function delivered(client: WriteClient, sessionID: string, messageID: string) {
  try {
    await client.session.message.get({ sessionID, messageID })
    return true
  } catch (cause) {
    if (sessionErrorStatus(cause) === 404 && !isSessionNotFound(cause)) return false
    throw cause
  }
}

async function admitPrompt(client: WriteClient, input: PromptInput, rejectDelivered: boolean) {
  try {
    const value = await admit(client, input.sessionID, async () => {
      if (rejectDelivered && input.id && (await delivered(client, input.sessionID, input.id))) {
        throw new SessionWriteError(409, "Prompt has already been delivered")
      }
      const selection = await select(client, input)
      return { value: await client.session.prompt(input), selection }
    })
    return { ok: true, ...value } as const
  } catch (cause) {
    return failure(cause)
  }
}

export async function admitSessionPrompt(client: WriteClient, input: PromptInput) {
  return admitPrompt(client, input, false)
}

export async function compactSession(
  client: WriteClient,
  input: Selection & { readonly sessionID: string },
  signal?: AbortSignal,
): Promise<SessionWriteResult<boolean>> {
  const id = `msg_${randomUUID().replaceAll("-", "_")}`
  const wait = observeSessionExecution(client, {
    sessionID: input.sessionID,
    promptID: id,
    operation: "compaction",
    signal,
  })
  try {
    const ready = await wait.ready
    if (ready && !ready.ok) return failure(ready.error)
    await admit(client, input.sessionID, async () => {
      await select(client, input)
      await client.session.compact({ sessionID: input.sessionID, id })
    })
    const result = await wait.result
    if (!result.ok) return failure(result.error)
    if (result.value.type === "failed")
      return failure(new SessionWriteError(500, result.value.error.message))
    if (result.value.type === "interrupted")
      return failure(new SessionWriteError(409, "Session compaction was interrupted"))
    return { ok: true, value: true }
  } catch (cause) {
    return failure(cause)
  } finally {
    await wait.close()
  }
}

async function finalMessage(
  client: WriteClient,
  context: MessageContext,
  outcome: ExecutionOutcome,
): Promise<SessionWriteResult<MessageWithParts>> {
  if (outcome.messageID) {
    const message = await getMessage(client, context, outcome.messageID)
    if (message) return { ok: true, value: message }
  }
  const status = outcome.type === "interrupted" ? 409 : 500
  const message =
    outcome.type === "failed"
      ? outcome.error.message
      : outcome.type === "interrupted"
        ? "Session execution was interrupted"
        : "Session execution completed without an assistant message"
  return { ok: false, error: new SessionWriteError(status, message) }
}

export async function promptSession(
  client: WriteClient,
  input: PromptInput,
  context: Omit<MessageContext, "sessionID" | "parentID">,
  signal?: AbortSignal,
  onAccepted?: () => Promise<void>,
): Promise<SessionWriteResult<MessageWithParts>> {
  const id = input.id ?? `msg_${randomUUID().replaceAll("-", "_")}`
  const wait = observeSessionExecution(client, { sessionID: input.sessionID, promptID: id, signal })
  try {
    const ready = await wait.ready
    if (ready && !ready.ok) return failure(ready.error)
    const admitted = await admitPrompt(
      client,
      { ...input, id },
      input.id !== undefined && input.resume !== false,
    )
    if (!admitted.ok) return admitted
    await onAccepted?.()
    if (input.resume === false) {
      const message = toBuddyMessage(
        { ...admitted.value.payload, id, type: "user", time: admitted.value.time },
        { ...context, sessionID: input.sessionID, selection: admitted.selection },
      )
      return message
        ? { ok: true, value: message }
        : failure(new SessionWriteError(500, "Prompt admission could not be projected"))
    }
    const result = await wait.result
    if (!result.ok) return failure(result.error)
    await withdrawUndeliveredInput(
      client,
      { sessionID: input.sessionID, promptID: id },
      result.value,
    )
    return await finalMessage(
      client,
      { ...context, sessionID: input.sessionID, parentID: id },
      result.value,
    )
  } catch (cause) {
    return failure(cause)
  } finally {
    await wait.close()
  }
}

async function executeCommand(
  client: WriteClient,
  input: CommandInput,
  display: string,
  context: Omit<MessageContext, "sessionID" | "parentID">,
  signal?: AbortSignal,
  onAccepted?: () => Promise<void>,
): Promise<SessionWriteResult<MessageWithParts | Session>> {
  let admitting = false
  const wait = observeSessionExecution(client, {
    sessionID: input.sessionID,
    signal,
    acceptsPrompt: (event) =>
      admitting &&
      event.data.item.type === "user" &&
      readCommandDisplay(event.data.item.payload.metadata) === display,
  })
  try {
    const ready = await wait.ready
    if (ready && !ready.ok) return failure(ready.error)
    await admit(client, input.sessionID, async () => {
      await select(client, input)
      const before = await client.message.list({
        sessionID: input.sessionID,
        type: "user",
        limit: 1,
        order: "desc",
      })
      admitting = true
      await client.session.command(input)
      await onAccepted?.()
      if (wait.promptID !== undefined) return
      const pending = await client.session.inbox.list({ sessionID: input.sessionID })
      const history = await client.message.list({
        sessionID: input.sessionID,
        type: "user",
        limit: 1,
        order: "desc",
      })
      const hasPrompt =
        pending.some(
          (item) => item.type === "user" && readCommandDisplay(item.payload.metadata) === display,
        ) ||
        history.data.some(
          (message) =>
            message.id !== before.data[0]?.id && readCommandDisplay(message.metadata) === display,
        )
      if (hasPrompt) await wait.accepted
    })
    if (wait.promptID === undefined)
      return { ok: true, value: await getSession(client, input.sessionID) }
    const result = await wait.result
    if (!result.ok) return failure(result.error)
    await withdrawUndeliveredInput(
      client,
      { sessionID: input.sessionID, promptID: wait.promptID },
      result.value,
    )
    return await finalMessage(
      client,
      { ...context, sessionID: input.sessionID, parentID: wait.promptID },
      result.value,
    )
  } catch (cause) {
    return failure(cause)
  } finally {
    await wait.close()
  }
}

export async function commandSession(
  client: WriteClient & Pick<OpenCodeClient, "skill">,
  input: CommandInput,
  context: Omit<MessageContext, "sessionID" | "parentID">,
  signal?: AbortSignal,
  onAccepted?: () => Promise<void>,
): Promise<SessionWriteResult<MessageWithParts | Session>> {
  const name = input.name.replace(/^\/+/, "").trim()
  const args = input.text.trim()
  const display = `/${name}${args ? ` ${args}` : ""}`
  const command = hiddenRuntimeCommandNames.has(name)
    ? undefined
    : await executeCommand(client, { ...input, name }, display, context, signal, onAccepted)
  if (command && (command.ok || !Schema.is(CommandNotFound)(command.error.cause))) return command
  try {
    const skills = await client.skill.list({ location: { directory: context.directory } })
    if (!skills.data.some((skill) => skill.id === name))
      return (
        command ??
        failure(
          Object.assign(new Error(`Command not found: /${name}`), { _tag: "CommandNotFoundError" }),
        )
      )
  } catch (cause) {
    return failure(cause)
  }
  return promptSession(
    client,
    {
      sessionID: input.sessionID,
      agent: input.agent,
      model: input.model,
      delivery: input.delivery,
      text: args,
      files: input.files,
      agents: input.agents,
      skills: [{ id: name }, ...(input.skills?.filter((skill) => skill.id !== name) ?? [])],
      metadata: { buddy: { command: { name, arguments: args, display } } },
    },
    context,
    signal,
    onAccepted,
  )
}
