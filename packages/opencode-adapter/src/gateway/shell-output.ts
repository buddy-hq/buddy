import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionMessageAssistantTool,
  SessionMessageInfo,
} from "@opencode/client"
import { open } from "node:fs/promises"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"
import { shellObserverFor } from "../shell-observer"

export type ShellOutputClient = Pick<OpenCodeClient, "event">
export type LiveShellOutput = { readonly output: string; readonly cursor: number }
export const MaxLiveShells = 32

const MaxOutputBytes = 16 * 1024

function scheduleOutput(tick: () => void) {
  const timer = setInterval(tick, 500)
  return () => clearInterval(timer)
}

export function runningShellID(part: SessionMessageAssistantTool): string | undefined {
  if ((part.name !== "shell" && part.name !== "bash") || part.state.status !== "running")
    return undefined
  return parseStringValue(part.state.metadata.shellID)
}

export async function readShellOutput(
  client: ShellOutputClient,
  input: {
    readonly id: string
    readonly directory: string
    readonly previous?: LiveShellOutput
    readonly signal?: AbortSignal
  },
): Promise<LiveShellOutput | undefined> {
  const observer = shellObserverFor(client)
  const capture = observer?.running(input.directory).find((shell) => shell.id === input.id)
  if (!capture || input.signal?.aborted) return undefined
  try {
    const file = await open(capture.file, "r")
    try {
      const { size } = await file.stat()
      if (size === input.previous?.cursor) return input.previous
      const start = Math.max(0, size - MaxOutputBytes)
      const bytes = Buffer.alloc(size - start)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, start)
      if (
        input.signal?.aborted ||
        !observer?.running(input.directory).some((shell) => shell.id === input.id)
      )
        return undefined
      return { output: bytes.subarray(0, bytesRead).toString("utf8"), cursor: start + bytesRead }
    } finally {
      await file.close()
    }
  } catch {
    return undefined
  }
}

export async function readMessageShellOutput(
  client: ShellOutputClient,
  messages: readonly SessionMessageInfo[],
  directory: string,
) {
  const output = new Map<string, LiveShellOutput>()
  for (const message of messages) {
    if (message.type !== "assistant" || message.time.completed !== undefined) continue
    for (const part of message.content) {
      if (part.type !== "tool") continue
      const id = runningShellID(part)
      if (!id || output.has(id)) continue
      const latest = await readShellOutput(client, { id, directory })
      if (latest) output.set(id, latest)
    }
  }
  return output
}

export async function* shellOutputTicks(
  events: AsyncIterable<OpenCodeEvent>,
  input: {
    readonly signal: AbortSignal
    readonly active: () => boolean
    readonly stop: () => void
  },
): AsyncGenerator<OpenCodeEvent | undefined> {
  const iterator = events[Symbol.asyncIterator]()
  let wake = Promise.withResolvers<void>()
  let pending: IteratorResult<OpenCodeEvent> | undefined
  let failed: { readonly cause: unknown } | undefined
  let tick = false
  const next = () => {
    void iterator.next().then(
      (value) => {
        pending = value
        wake.resolve()
      },
      (cause: unknown) => {
        failed = { cause }
        wake.resolve()
      },
    )
  }
  const unschedule = scheduleOutput(() => {
    if (!input.active()) return
    tick = true
    wake.resolve()
  })
  const onAbort = () => wake.resolve()
  input.signal.addEventListener("abort", onAbort, { once: true })
  next()
  try {
    while (!input.signal.aborted) {
      await wake.promise
      wake = Promise.withResolvers<void>()
      if (input.signal.aborted) return
      if (failed) throw failed.cause
      if (pending) {
        const value = pending
        pending = undefined
        if (value.done) return
        yield value.value
        next()
      }
      if (tick) {
        tick = false
        yield undefined
      }
    }
  } finally {
    input.stop()
    unschedule()
    input.signal.removeEventListener("abort", onAbort)
    await iterator.return?.()
  }
}
