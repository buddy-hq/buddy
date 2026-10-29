import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import type { OpenCodeEvent, OpenCodeHost } from "../src/host"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createShellPermissionHook } from "../src/extension/shell-permission"

function invocation(command: string, tool = "shell") {
  return {
    tool,
    input: { command },
    sessionID: Schema.decodeUnknownSync(Session.ID)("ses_shell"),
    agent: Schema.decodeUnknownSync(Agent.ID)("buddy"),
    messageID: Schema.decodeUnknownSync(SessionMessage.ID)("msg_shell"),
    id: Schema.decodeUnknownSync(Tool.CallID)("call_shell"),
  }
}

function lifecycle() {
  const subscribers = new Set<(event: OpenCodeEvent) => Promise<void>>()
  const client: Pick<OpenCodeHost, "event"> = {
    event: {
      async *subscribe(options) {
        const queue: {
          event: OpenCodeEvent
          consumed: ReturnType<typeof Promise.withResolvers<void>>
        }[] = []
        let changed = Promise.withResolvers<void>()
        const push = (event: OpenCodeEvent) => {
          const consumed = Promise.withResolvers<void>()
          queue.push({ event, consumed })
          changed.resolve()
          return consumed.promise
        }
        const onAbort = () => changed.resolve()
        options?.signal?.addEventListener("abort", onAbort, { once: true })
        subscribers.add(push)
        try {
          yield { id: "evt_connected", type: "server.connected", data: {} }
          while (!options?.signal?.aborted) {
            const next = queue.shift()
            if (!next) {
              await changed.promise
              changed = Promise.withResolvers<void>()
              continue
            }
            try {
              yield next.event
            } finally {
              next.consumed.resolve()
            }
          }
        } finally {
          subscribers.delete(push)
          options?.signal?.removeEventListener("abort", onAbort)
        }
      },
    },
  }
  return {
    client,
    subscribers,
    emit: (event: OpenCodeEvent) => Promise.all([...subscribers].map((push) => push(event))),
  }
}

test("the shell hook waits for one batched approval and preserves the invocation", async () => {
  const directory = path.join(TEST_SANDBOX.root, "shell-hook", "notebook")
  const outside = path.join(TEST_SANDBOX.root, "shell-hook", "outside")
  const second = path.join(TEST_SANDBOX.root, "shell-hook", "second")
  await fs.mkdir(directory, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  const event = invocation(`rm '${path.join(outside, "x")}' '${path.join(second, "y")}'`)
  const input = event.input
  const permission = Promise.withResolvers<void>()
  const asked = Promise.withResolvers<void>()
  const events = lifecycle()
  let settled = false
  let asks = 0
  const hook = createShellPermissionHook({
    location: { directory, project: { directory: path.parse(directory).root } },
    getClient: async () => events.client,
    async ask(context, request, signal) {
      asks++
      expect(context).toBe(event)
      expect(signal.aborted).toBe(false)
      const patterns = [outside, second].map((dir) => path.join(dir, "*").replaceAll("\\", "/"))
      expect(request).toEqual({
        permission: "external_directory",
        patterns,
        always: patterns,
        metadata: { command: input.command, directories: [outside, second] },
      })
      asked.resolve()
      await permission.promise
    },
  })
  const pending = hook(event).then(() => {
    settled = true
  })
  await asked.promise
  expect(settled).toBe(false)
  permission.resolve()
  await pending
  expect(settled).toBe(true)
  expect(asks).toBe(1)
  expect(event.input).toBe(input)
  expect(events.subscribers.size).toBe(0)
})

test("internal and non-shell calls need no approval or lifecycle subscription", async () => {
  const directory = path.join(TEST_SANDBOX.root, "shell-internal")
  const hook = createShellPermissionHook({
    location: { directory, project: { directory } },
    async getClient() {
      throw new Error("Unexpected lifecycle subscription")
    },
    async ask() {
      throw new Error("Unexpected permission request")
    },
  })
  await hook(invocation("rm a.txt"))
  await hook(invocation(`rm '${path.join(path.dirname(directory), "external", "x")}'`, "read"))
})

test("declining permission fails the hook with the original feedback", async () => {
  const directory = path.join(TEST_SANDBOX.root, "shell-decline", "notebook")
  const outside = path.join(TEST_SANDBOX.root, "shell-decline", "outside", "x")
  const denied = new ToolError({ message: "Use the notebook instead" })
  const events = lifecycle()
  const hook = createShellPermissionHook({
    location: { directory, project: { directory } },
    getClient: async () => events.client,
    async ask() {
      throw denied
    },
  })
  await expect(hook(invocation(`rm '${outside}'`))).rejects.toBe(denied)
  expect(events.subscribers.size).toBe(0)
})

function terminal(
  type: "interrupted" | "failed" | "succeeded" | "idle",
  sessionID = "ses_shell",
): OpenCodeEvent {
  const base = {
    id: "evt_terminal",
    created: 1,
    durable: { aggregateID: sessionID, seq: 1, version: 1 as const },
  }
  if (type === "interrupted")
    return { ...base, type: "session.execution.interrupted", data: { sessionID, reason: "user" } }
  if (type === "failed")
    return {
      ...base,
      type: "session.execution.failed",
      data: { sessionID, error: { type: "unknown", message: "Stopped" } },
    }
  if (type === "succeeded")
    return { ...base, type: "session.execution.succeeded", data: { sessionID } }
  return { ...base, type: "session.status", data: { sessionID, status: { type: "idle" } } }
}

test.each(["interrupted", "failed", "succeeded", "idle"] as const)(
  "%s cancels only that session's pending shell approval",
  async (type) => {
    const directory = path.join(TEST_SANDBOX.root, "shell-cancel", "notebook")
    const outside = path.join(TEST_SANDBOX.root, "shell-cancel", "outside", "x")
    const events = lifecycle()
    const asked = Promise.withResolvers<AbortSignal>()
    const hook = createShellPermissionHook({
      location: { directory, project: { directory } },
      getClient: async () => events.client,
      async ask(_context, _request, signal) {
        asked.resolve(signal)
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        })
      },
    })
    const pending = hook(invocation(`rm '${outside}'`))
    const outcome = pending.catch((cause: unknown) => cause)
    const signal = await asked.promise
    await events.emit(terminal(type, "ses_other"))
    expect(signal.aborted).toBe(false)
    await events.emit(terminal(type))
    expect(await outcome).toMatchObject({ name: "AbortError" })
    expect(signal.aborted).toBe(true)
    expect(events.subscribers.size).toBe(0)
  },
)
