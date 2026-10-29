import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { createRuntimeHarness, scenario } from "./harness"

test("shell external file arguments require approval before execution and both parsers coexist", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const host = runtimeHost(await getAgentRuntime())
  const outside = await fs.mkdtemp(path.join(path.dirname(api.directory), "shell-outside-"))
  const target = path.join(outside, "created.txt")
  const command =
    process.platform === "win32" ? `New-Item -ItemType File -Path "${target}"` : `touch '${target}'`
  const abort = new AbortController()
  const stream = host.event.subscribe({
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
  })
  const updates = stream[Symbol.asyncIterator]()
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    for (const decision of ["reject", "once"] as const) {
      const session = await api.create()
      await api.promptAsync(
        session.id,
        scenario({
          kind: "tool",
          name: "shell",
          arguments: { command, description: "Create external fixture" },
        }),
      )
      let permitted = false
      while (true) {
        const update = await updates.next()
        if (update.done) throw new Error("Runtime ended before shell settled")
        const event = update.value
        if (event.type === "permission.asked" && event.data.sessionID === session.id) {
          expect(permitted).toBe(false)
          expect(event.data).toMatchObject({
            action: "external_directory",
            resources: [path.join(outside, "*").replaceAll("\\", "/")],
            metadata: { command, directories: [outside] },
          })
          expect(await Bun.file(target).exists()).toBe(false)
          permitted = true
          await host.permission.reply({
            sessionID: session.id,
            requestID: event.data.id,
            decision,
            message: decision === "reject" ? "Use notebook files" : undefined,
          })
        }
        if (
          (event.type === "session.execution.succeeded" ||
            event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted") &&
          event.data.sessionID === session.id
        )
          break
      }
      expect(permitted).toBe(true)
      expect(await Bun.file(target).exists()).toBe(decision === "once")
      const part = (await api.messages(session.id))
        .flatMap((message) => message.parts)
        .find((part) => part.type === "tool" && part.tool === "shell")
      expect(part?.type === "tool" ? part.state.status : undefined).toBe(
        decision === "once" ? "completed" : "error",
      )
      if (decision === "reject") {
        expect(part).toMatchObject({
          type: "tool",
          state: { status: "error", error: expect.stringContaining("Use notebook files") },
        })
      }
    }
    const session = await api.create()
    const response = await api.prompt(
      session.id,
      scenario({
        kind: "tool",
        name: "shell",
        arguments: { command: "echo buddy-shell-parser-ok", description: "Check internal shell" },
      }),
    )
    expect(response.status).toBe(200)
    const part = (await api.messages(session.id))
      .flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.tool === "shell")
    expect(part).toMatchObject({
      type: "tool",
      state: { status: "completed", output: expect.stringContaining("buddy-shell-parser-ok") },
    })
  } finally {
    abort.abort()
    await updates.return?.()
    await fs.rm(outside, { recursive: true, force: true })
  }
})

test("stopping a shell call awaiting external approval rejects it and settles the session", async () => {
  await using api = await createRuntimeHarness({ permission: { bash: "allow" } })
  const host = runtimeHost(await getAgentRuntime())
  const outside = await fs.mkdtemp(path.join(path.dirname(api.directory), "shell-stop-outside-"))
  const target = path.join(outside, "created.txt")
  const command =
    process.platform === "win32" ? `New-Item -ItemType File -Path "${target}"` : `touch '${target}'`
  const abort = new AbortController()
  const stream = host.event.subscribe({
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
  })
  const updates = stream[Symbol.asyncIterator]()
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    const session = await api.create()
    await api.promptAsync(
      session.id,
      scenario({
        kind: "tool",
        name: "shell",
        arguments: { command, description: "Create external fixture after approval" },
      }),
    )
    let requestID: string | undefined
    while (!requestID) {
      const next = await updates.next()
      if (next.done) throw new Error("Runtime ended before shell requested approval")
      if (next.value.type === "permission.asked" && next.value.data.sessionID === session.id) {
        expect(next.value.data.action).toBe("external_directory")
        requestID = next.value.data.id
      }
    }
    expect((await api.permissions(session.id)).map((permission) => permission.id)).toEqual([
      requestID,
    ])
    expect(await Bun.file(target).exists()).toBe(false)
    expect(await api.json(`/session/${session.id}/abort`, { method: "POST" })).toBe(true)
    let interrupted = false
    let rejected = false
    while (!interrupted || !rejected) {
      const next = await updates.next()
      if (next.done)
        throw new Error("Runtime ended before shell interruption and permission cleanup")
      const event = next.value
      if (event.type === "session.execution.interrupted" && event.data.sessionID === session.id)
        interrupted = true
      if (
        event.type === "permission.replied" &&
        event.data.sessionID === session.id &&
        event.data.requestID === requestID
      ) {
        expect(event.data.reply).toBe("reject")
        rejected = true
      }
    }
    expect(await api.permissions(session.id)).toEqual([])
    expect(await Bun.file(target).exists()).toBe(false)
    expect((await api.statuses())[session.id]).toBeUndefined()
  } finally {
    abort.abort()
    await updates.return?.()
    await fs.rm(outside, { recursive: true, force: true })
  }
})
