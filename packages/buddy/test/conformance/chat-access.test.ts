import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { createRuntimeHarness, scenario } from "./harness"

function watchShell(host: ReturnType<typeof runtimeHost>) {
  const abort = new AbortController()
  const updates = host.event.subscribe({
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
  })[Symbol.asyncIterator]()
  return {
    updates,
    async stop() {
      abort.abort()
      await updates.return?.()
    },
    async run(
      api: Awaited<ReturnType<typeof createRuntimeHarness>>,
      sessionID: string,
      command: string,
      reply?: "once" | "always",
    ) {
      await api.promptAsync(
        sessionID,
        scenario({
          kind: "tool",
          name: "shell",
          arguments: { command, description: "Run a command" },
        }),
      )
      let asked = false
      while (true) {
        const update = await updates.next()
        if (update.done) throw new Error("Runtime ended before the shell settled")
        const event = update.value
        if (event.type === "permission.asked" && event.data.sessionID === sessionID) {
          expect(event.data.action).toBe("shell")
          asked = true
          if (reply === undefined) throw new Error(`Shell asked for ${command}`)
          await host.permission.reply({
            sessionID,
            requestID: event.data.id,
            decision: reply,
          })
        }
        if (
          (event.type === "session.execution.succeeded" ||
            event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted") &&
          event.data.sessionID === sessionID
        ) {
          expect(event.type).toBe("session.execution.succeeded")
          return asked
        }
      }
    },
  }
}

const supervisedAccessPatch = z.object({
  buddyAccess: z.object({ mode: z.literal("supervised") }),
})

async function until<T>(promise: Promise<T>, message: string): Promise<T> {
  const expired = Promise.withResolvers<never>()
  const timer = setTimeout(() => expired.reject(new Error(message)), 10_000)
  try {
    return await Promise.race([promise, expired.promise])
  } finally {
    clearTimeout(timer)
  }
}

async function setAccess(
  api: Awaited<ReturnType<typeof createRuntimeHarness>>,
  sessionID: string,
  mode: "supervised" | "default" | "full",
) {
  expect(
    await api.json(`/session/${sessionID}/access`, {
      method: "PUT",
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(20_000),
    }),
  ).toEqual({ mode })
}

test("full access runs a shell command outside the notebook without a permission request", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const host = runtimeHost(await getAgentRuntime())
  const outside = await fs.mkdtemp(path.join(path.dirname(api.directory), "chat-access-outside-"))
  const target = path.join(outside, "created.txt")
  const command =
    process.platform === "win32" ? `New-Item -ItemType File -Path "${target}"` : `touch '${target}'`
  const abort = new AbortController()
  const updates = host.event.subscribe({
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
  })[Symbol.asyncIterator]()
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    const session = await api.create()
    expect(
      await api.json(`/session/${session.id}/access`, {
        method: "PUT",
        body: JSON.stringify({ mode: "full" }),
        signal: AbortSignal.timeout(20_000),
      }),
    ).toEqual({ mode: "full" })
    await api.promptAsync(
      session.id,
      scenario({
        kind: "tool",
        name: "shell",
        arguments: { command, description: "Create external fixture" },
      }),
    )
    let asked = false
    while (true) {
      const update = await updates.next()
      if (update.done) throw new Error("Runtime ended before the shell settled")
      const event = update.value
      if (event.type === "permission.asked" && event.data.sessionID === session.id) asked = true
      if (
        (event.type === "session.execution.succeeded" ||
          event.type === "session.execution.failed" ||
          event.type === "session.execution.interrupted") &&
        event.data.sessionID === session.id
      ) {
        expect(event.type).toBe("session.execution.succeeded")
        break
      }
    }
    expect(asked).toBe(false)
    expect(await Bun.file(target).exists()).toBe(true)
  } finally {
    abort.abort()
    await updates.return?.()
    await fs.rm(outside, { recursive: true, force: true })
  }
})

test("supervised mode asks before a plain shell command", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const host = runtimeHost(await getAgentRuntime())
  const command = "echo buddy-supervised-asks"
  const abort = new AbortController()
  const updates = host.event.subscribe({
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
  })[Symbol.asyncIterator]()
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    const session = await api.create()
    expect(
      await api.json(`/session/${session.id}/access`, {
        method: "PUT",
        body: JSON.stringify({ mode: "supervised" }),
        signal: AbortSignal.timeout(20_000),
      }),
    ).toEqual({ mode: "supervised" })
    await api.promptAsync(
      session.id,
      scenario({
        kind: "tool",
        name: "shell",
        arguments: { command, description: "Print a marker" },
      }),
    )
    let requestID = ""
    while (requestID === "") {
      const update = await updates.next()
      if (update.done) throw new Error("Runtime ended before the shell asked")
      const event = update.value
      if (
        (event.type === "session.execution.succeeded" ||
          event.type === "session.execution.failed") &&
        event.data.sessionID === session.id
      ) {
        throw new Error(`Shell settled as ${event.type} before asking`)
      }
      if (event.type === "permission.asked" && event.data.sessionID === session.id) {
        expect(event.data.action).toBe("shell")
        requestID = event.data.id
      }
    }
    await host.permission.reply({
      sessionID: session.id,
      requestID,
      decision: "once",
    })
    while (true) {
      const update = await updates.next()
      if (update.done) throw new Error("Runtime ended before the shell settled")
      const event = update.value
      if (
        (event.type === "session.execution.succeeded" ||
          event.type === "session.execution.failed" ||
          event.type === "session.execution.interrupted") &&
        event.data.sessionID === session.id
      ) {
        expect(event.type).toBe("session.execution.succeeded")
        break
      }
    }
    const part = (await api.messages(session.id))
      .flatMap((message) => message.parts)
      .find((entry) => entry.type === "tool" && entry.tool === "shell")
    expect(part).toMatchObject({
      type: "tool",
      state: { status: "completed", output: expect.stringContaining("buddy-supervised-asks") },
    })
  } finally {
    abort.abort()
    await updates.return?.()
  }
})

test("a child's shell asks in supervised mode when bash is allowed", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const shell = watchShell(runtimeHost(await getAgentRuntime()))
  try {
    expect((await shell.updates.next()).value?.type).toBe("server.connected")
    const root = await api.create()
    const child = await api.create({ parentID: root.id })
    await setAccess(api, root.id, "supervised")
    expect(await shell.run(api, child.id, "echo buddy-child-supervised", "once")).toBe(true)
  } finally {
    await shell.stop()
  }
})

test("an already running child follows the root into and out of supervised mode", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const shell = watchShell(runtimeHost(await getAgentRuntime()))
  try {
    expect((await shell.updates.next()).value?.type).toBe("server.connected")
    const root = await api.create()
    const child = await api.create({ parentID: root.id })
    expect(await shell.run(api, child.id, "echo buddy-child-default")).toBe(false)
    await setAccess(api, root.id, "supervised")
    expect(await shell.run(api, child.id, "echo buddy-child-supervised", "once")).toBe(true)
    await setAccess(api, root.id, "default")
    expect(await shell.run(api, child.id, "echo buddy-child-default-again")).toBe(false)
  } finally {
    await shell.stop()
  }
})

test("a saved always allow still runs a supervised shell command", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const shell = watchShell(runtimeHost(await getAgentRuntime()))
  try {
    expect((await shell.updates.next()).value?.type).toBe("server.connected")
    const session = await api.create()
    await setAccess(api, session.id, "supervised")
    expect(await shell.run(api, session.id, "echo buddy-supervised-remembered", "always")).toBe(true)
    expect(await shell.run(api, session.id, "echo buddy-supervised-remembered")).toBe(false)
  } finally {
    await shell.stop()
  }
})

test("a child prepared after the root's choice does not store buddyAccess", async () => {
  await using api = await createRuntimeHarness()
  const parent = await api.create({ agent: "buddy" })
  await setAccess(api, parent.id, "supervised")
  const response = await api.prompt(
    parent.id,
    scenario({
      kind: "delegate",
      role: "flashcard-author",
      prompt: scenario({ kind: "reply", text: "Child ready" }),
    }),
    { agent: "buddy" },
  )
  expect(response.status).toBe(200)
  const child = (await api.children(parent.id))[0]
  if (!child) throw new Error("Missing prepared child")
  expect(child.metadata?.buddyAccess).toBeUndefined()
  expect((await api.session(parent.id)).metadata?.buddyAccess).toEqual({ mode: "supervised" })
})

test("a persona delegate root keeps supervised mode after a prompt", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const root = await api.create({ agent: "general" })
  await setAccess(api, root.id, "supervised")
  const response = await api.prompt(
    root.id,
    scenario({ kind: "reply", text: "Ready" }),
    { agent: "general" },
  )
  expect(response.status).toBe(200)
  expect(await api.json(`/session/${root.id}/access`)).toEqual({ mode: "supervised" })
  const request = await runtimeHost(await getAgentRuntime()).permission.create({
    sessionID: root.id,
    action: "shell",
    resources: ["echo buddy-root-supervised"],
  })
  expect(request.effect).toBe("ask")
})

test("a configured child drops a copied access mode after a prompt", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const root = await api.create()
  await setAccess(api, root.id, "full")
  const child = await api.create({ parentID: root.id })
  expect((await api.session(child.id)).metadata?.buddyAccess).toEqual({ mode: "full" })
  const response = await api.prompt(child.id, scenario({ kind: "reply", text: "Ready" }))
  expect(response.status).toBe(200)
  expect((await api.session(child.id)).metadata?.buddyAccess).toBeUndefined()
  expect((await api.session(root.id)).metadata?.buddyAccess).toEqual({ mode: "full" })
})

test("an older full transition leaves a later supervised shell pending", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const runtime = await getAgentRuntime()
  const root = await api.create()
  const child = await api.create({ parentID: root.id })
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const reachedSetter = Promise.withResolvers<void>()
  const supervisedWrite = Promise.withResolvers<void>()
  const order: Array<"full-drain" | "supervised-write"> = []
  const originalChildren = runtime.conversations.children.bind(runtime.conversations)
  const originalGet = runtime.conversations.get.bind(runtime.conversations)
  const originalPatch = runtime.conversations.patchMetadata.bind(runtime.conversations)
  const originalPending = runtime.approvals.pending.bind(runtime.approvals)
  let paused = false
  let setterGets = 0
  let recordedDrain = false
  Object.defineProperty(runtime.conversations, "children", {
    configurable: true,
    value: async (id: string) => {
      if (id === root.id && !paused) {
        paused = true
        entered.resolve()
        await released.promise
      }
      return originalChildren(id)
    },
  })
  Object.defineProperty(runtime.conversations, "get", {
    configurable: true,
    value: async (id: string) => {
      const session = await originalGet(id)
      if (id === root.id && paused) {
        setterGets += 1
        if (setterGets === 2) reachedSetter.resolve()
      }
      return session
    },
  })
  Object.defineProperty(runtime.conversations, "patchMetadata", {
    configurable: true,
    value: async (id: string, patch: Parameters<typeof originalPatch>[1]) => {
      if (id === root.id && supervisedAccessPatch.safeParse(patch).success) {
        order.push("supervised-write")
        supervisedWrite.resolve()
      }
      return originalPatch(id, patch)
    },
  })
  Object.defineProperty(runtime.approvals, "pending", {
    configurable: true,
    value: async (scope: Parameters<typeof originalPending>[0]) => {
      const requests = await originalPending(scope)
      if (!recordedDrain && paused && scope.sessions.includes(root.id)) {
        recordedDrain = true
        order.push("full-drain")
      }
      return requests
    },
  })
  const olderFull = api.request(`/session/${root.id}/access`, {
    method: "PUT",
    body: JSON.stringify({ mode: "full" }),
  })
  try {
    await until(
      Promise.race([
        entered.promise,
        olderFull.then(() => {
          throw new Error("Full access finished before the family walk")
        }),
      ]),
      "Full access did not reach the family walk",
    )
    const supervised = api.json(`/session/${root.id}/access`, {
      method: "PUT",
      body: JSON.stringify({ mode: "supervised" }),
    })
    await until(reachedSetter.promise, "Supervised access did not reach the setter")
    await Promise.resolve()
    expect(order).toEqual([])
    released.resolve()
    await until(supervisedWrite.promise, "Supervised access did not write metadata")
    expect(order).toEqual(["full-drain", "supervised-write"])
    expect((await olderFull).status).toBe(200)
    expect(await supervised).toEqual({ mode: "supervised" })
    const request = await runtimeHost(runtime).permission.create({
      sessionID: child.id,
      action: "shell",
      resources: ["echo pending-after-supervised"],
    })
    expect(request.effect).toBe("ask")
    expect(
      (await runtime.approvals.pending({ sessions: [child.id] })).map((entry) => entry.id),
    ).toEqual([request.id])
    expect(await api.json(`/session/${root.id}/access`)).toEqual({ mode: "supervised" })
  } finally {
    released.resolve()
    await olderFull.catch(() => undefined)
    Object.defineProperty(runtime.conversations, "children", {
      configurable: true,
      writable: true,
      value: originalChildren,
    })
    Object.defineProperty(runtime.conversations, "get", {
      configurable: true,
      writable: true,
      value: originalGet,
    })
    Object.defineProperty(runtime.conversations, "patchMetadata", {
      configurable: true,
      writable: true,
      value: originalPatch,
    })
    Object.defineProperty(runtime.approvals, "pending", {
      configurable: true,
      writable: true,
      value: originalPending,
    })
  }
})
