import type { OpenCodeHost } from "../host"
import type { SessionPrompt } from "../plugin"
import z from "zod"

const jsonObject = z.record(z.string(), z.json())

function parseJsonObject<T>(value: T) {
  const parsed = jsonObject.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

type CommandDisplay = { name: string; arguments: string; display: string }
const pending = new Map<string, CommandDisplay[]>()

async function runWithCommandInvocationDisplay<T>(
  input: { sessionID: string; command: string; argumentsText: string },
  run: () => Promise<T>,
): Promise<T> {
  const name = input.command.replace(/^\/+/, "").trim()
  const argumentsText = input.argumentsText.trim()
  const display: CommandDisplay = {
    name, arguments: argumentsText,
    display: `/${name}${argumentsText ? ` ${argumentsText}` : ""}`,
  }
  const queue = pending.get(input.sessionID) ?? []
  queue.push(display)
  pending.set(input.sessionID, queue)
  try {
    return await run()
  } finally {
    const index = queue.indexOf(display)
    if (index >= 0) queue.splice(index, 1)
    if (queue.length === 0) pending.delete(input.sessionID)
  }
}

export function applyCommandInvocationDisplay(event: SessionPrompt): void {
  const queue = pending.get(event.sessionID)
  const command = queue?.shift()
  if (!command) return
  event.metadata = { ...event.metadata, buddy: { ...parseJsonObject(event.metadata?.buddy), command } }
}

export function withBuddyCommandDisplay(client: OpenCodeHost): OpenCodeHost {
  const admissions = new Map<string, Promise<void>>()
  async function admit<T>(sessionID: string, run: () => Promise<T>): Promise<T> {
    const previous = admissions.get(sessionID)
    const completed = Promise.withResolvers<void>()
    admissions.set(sessionID, completed.promise)
    await previous
    try {
      return await run()
    } finally {
      completed.resolve()
      if (admissions.get(sessionID) === completed.promise) admissions.delete(sessionID)
    }
  }
  const session: OpenCodeHost["session"] = {
    ...client.session,
    prompt: (input, options) => admit(input.sessionID, () => client.session.prompt(input, options)),
    command: (input, options) => admit(input.sessionID, () => runWithCommandInvocationDisplay({
      sessionID: input.sessionID, command: input.name, argumentsText: input.text ?? "",
    }, () => client.session.command(input, options))),
  }
  return { ...client, session, sessions: session }
}
