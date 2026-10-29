import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { BuddyEvent } from "@buddy/transcript-contract/event"
import { BenchClientActionSchema, BenchClientLeaseSchema } from "../../src/learning/features/bench/client-actions"
import { benchTargetKey } from "../../src/learning/features/bench/context"
import { BUDDY_TMP_DIR } from "../../src/runtime/runtime-paths"
import { parseJsonObjectText, requireString } from "../helpers/parse"
import { createRuntimeHarness, scenario } from "./harness"

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

async function benchClientEvents(api: Awaited<ReturnType<typeof createRuntimeHarness>>) {
  const query = new URLSearchParams({ workspaceInstanceID: "capture-client", connectionGeneration: "1" })
  const response = await api.request(`/event?${query}`)
  if (!response.ok || !response.body) throw new Error(`Bench SSE connection failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  return {
    async until(type: string) {
      while (true) {
        const boundary = buffer.indexOf("\n\n")
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
          if (!data) continue
          const event = Schema.decodeUnknownSync(BuddyEvent)(JSON.parse(data))
          if (event.payload.type === type) return event
          continue
        }
        const read = await reader.read()
        if (read.done) throw new Error(`Bench SSE ended before ${type}`)
        buffer += decoder.decode(read.value, { stream: true })
      }
    },
    async [Symbol.asyncDispose]() { await reader.cancel() },
  }
}

test("Bench screenshots captured during a turn are removed after the turn finishes", async () => {
  await using api = await createRuntimeHarness()
  const session = await api.create()
  await using client = await benchClientEvents(api)
  const connection = BenchClientLeaseSchema.parse((await client.until("bench.client_lease")).payload.properties.lease)
  const lease = { instanceID: connection.instanceID, generation: connection.generation, leaseEpoch: connection.leaseEpoch }
  const target = { type: "workspace-file", root: "notebook", path: "notes.md", viewer: "markdown" } as const
  const context = {
    status: "open", visibility: "visible", mode: "docked",
    selectedTabKey: "file:markdown:notes.md",
    tabs: [{ tabKey: "file:markdown:notes.md", title: "notes.md", target }],
    targetKey: benchTargetKey(target),
    target: {
      type: "workspace-file", title: "notes.md", workspaceRoot: api.directory,
      path: "notes.md", absolutePath: path.join(api.directory, "notes.md"),
      route: "/_bench/markdown?path=notes.md", status: "ready",
    },
    drawer: null, metadata: [], content: "Capture this Bench note.", refs: [], hints: [],
  }
  await fs.writeFile(path.join(api.directory, "notes.md"), context.content)
  await api.json(`/bench/session/${session.id}/context`, { method: "PUT", body: JSON.stringify({
    lease, publicationSequence: 1, idempotencyKey: "capture-context", value: context,
  }) })
  await using events = await api.events()
  await api.promptAsync(session.id, scenario({
    kind: "tool", name: "bench_read_context", arguments: { responseFormat: "bench_screenshot_only" },
  }))
  const action = BenchClientActionSchema.parse((await client.until("bench.client_action")).payload.properties.action)
  expect(action.sessionID).toBe(session.id)
  expect(action.command.type).toBe("capture_bench_screenshot")

  const captureRoot = path.join(BUDDY_TMP_DIR, "bench-captures")
  expect(await fs.readdir(captureRoot)).toEqual([])
  const controller = new AbortController()
  const changes = fs.watch(captureRoot, { signal: controller.signal })
  const removed = (async () => {
    for await (const change of changes) {
      if (change.eventType === "rename" && (await fs.readdir(captureRoot)).length === 0) return
    }
    throw new Error("Capture watcher ended before cleanup")
  })()
  try {
    expect(await api.json(`/bench/client-actions/${action.actionID}/complete`, { method: "POST", body: JSON.stringify({
      outcome: "captured", lease, publicationSequence: 2,
      observedRoute: { status: "open", target, mode: "docked" },
      observedVisibility: "visible", drawer: null, context, pngBase64,
    }) })).toEqual({ status: "completed" })
    await events.idle(session.id)
    const outcome = (await api.messages(session.id)).flatMap((message) => message.parts).find(
      (part) => part.type === "tool" && part.tool === "bench_read_context",
    )
    if (outcome?.type !== "tool" || outcome.state.status !== "completed") throw new Error("Bench screenshot did not complete")
    const screenshot = requireString(parseJsonObjectText(outcome.state.output).temporaryBenchScreenshotPath)
    expect(path.dirname(path.dirname(screenshot))).toBe(captureRoot)
    if ((await fs.readdir(captureRoot)).length > 0) await removed
    expect(await fs.readdir(captureRoot)).toEqual([])
  } finally {
    controller.abort()
    await removed.catch(() => undefined)
  }
})
