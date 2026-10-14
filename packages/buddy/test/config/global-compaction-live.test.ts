import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { createOpenCodeHost, type OpenCodeEvent, type OpenCodeHost } from "@buddy/opencode-adapter/host"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { promptSession } from "@buddy/opencode-adapter/gateway/write"
import { GlobalRoutes } from "../../src/routes/global"
import { Config } from "../../src/config"
import { Global } from "../../src/storage"
import { readOpenCodeHostConfig } from "../../src/config/runtime/notebook-runtime-plan"
import { openCodeHostConfigFile, renderOpenCodeHostConfig } from "../../src/config/runtime/opencode-host-config"
import { scriptedModelPlugin } from "../opencode-runtime/scripted-model"
import { temporaryDirectory } from "../helpers/temporary-directory"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>

const app = new Hono().route("/api/global", GlobalRoutes)
const headers = { "content-type": "application/json" }
const QUIET_PERIOD_MILLISECONDS = 1_000

async function withGlobalConfig<T>(config: Config.Info, run: () => Promise<T>): Promise<T> {
  const previous = await Config.getGlobal()
  try {
    await Config.replaceGlobal(Config.Info.parse({ ...previous, ...config }))
    return await run()
  } finally { await Config.replaceGlobal(previous) }
}

async function createLiveCompactionHost() {
  const root = await temporaryDirectory({ prefix: "buddy-live-compaction-" })
  const directory = path.join(root.path, "workspace")
  const paths = { data: path.join(root.path, "data"), config: Global.Path.config, state: path.join(root.path, "state"), cache: path.join(root.path, "cache"), tmp: path.join(root.path, "tmp") }
  const requests: Parameters<LanguageModel["doStream"]>[0][] = []
  try {
    await Promise.all([directory, ...Object.values(paths)].map((entry) => fs.mkdir(entry, { recursive: true })))
    const host = await createOpenCodeHost({
      clientName: "buddy-live-compaction-test", paths, databasePath: ":memory:", fetchModels: false, fs: { fff: false },
      config: { ...await readOpenCodeHostConfig(), project: false, content: JSON.stringify({
        model: "scripted/chat",
        providers: { scripted: { package: "aisdk:@ai-sdk/perplexity", settings: { apiKey: "test" }, models: { chat: { limit: { context: 100_000, output: 1_000 } } } } },
        agents: { buddy: { system: "Fixture system." } },
      }) },
      plugins: [
        scriptedModelPlugin(requests),
        Plugin.define({ id: "buddy.test.compaction-summary", async setup(ctx) {
          await ctx.session.hook("compaction", (event) => { event.result = { summary: "Scripted summary." } })
        } }),
      ],
    })
    return { host, directory, async [Symbol.asyncDispose]() { try { await host.close() } finally { await root[Symbol.asyncDispose]() } } }
  } catch (error) { await root[Symbol.asyncDispose](); throw error }
}

async function observeConfigUpdates(host: OpenCodeHost) {
  const controller = new AbortController()
  const events = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
  const updates: OpenCodeEvent[] = []
  const waiters = new Set<() => void>()
  let connected!: () => void
  const ready = new Promise<void>((resolve) => { connected = resolve })
  const reading = (async () => {
    while (true) {
      const event = await events.next()
      if (event.done) return
      if (event.value.type === "server.connected") connected()
      if (event.value.type !== "config.updated") continue
      updates.push(event.value)
      for (const wake of waiters) wake()
    }
  })().catch(() => undefined)
  await ready
  return {
    count: () => updates.length,
    async next(after: number, timeout = 5_000) {
      const deadline = Date.now() + timeout
      while (updates.length <= after) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new Error("Timed out waiting for config.updated")
        await new Promise<void>((resolve) => {
          const wake = () => { clearTimeout(timer); waiters.delete(wake); resolve() }
          const timer = setTimeout(wake, remaining)
          waiters.add(wake)
        })
      }
    },
    async [Symbol.asyncDispose]() { controller.abort(); await reading },
  }
}

async function patchGlobal(body: Config.Info) {
  const response = await app.request("/api/global/config", { method: "PATCH", headers, body: JSON.stringify(body) })
  expect(response.status).toBe(200)
  return Config.Info.parse(await response.json())
}

async function compactions(host: OpenCodeHost, sessionID: string) {
  return (await host.message.list({ sessionID, type: "compaction" })).data
}

describe("global compaction settings on a running host", () => {
  test("applies an auto-compaction toggle from the settings route without restarting the host", async () => {
    await withGlobalConfig({ compaction: { auto: false, reserved: 99_999 } }, async () => {
      await using runtime = await createLiveCompactionHost()
      const { host, directory } = runtime
      await using updates = await observeConfigUpdates(host)
      const session = await host.session.create({ location: { directory }, agent: "buddy" })

      expect((await promptSession(host, { sessionID: session.id, text: "First turn" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
      expect(await compactions(host, session.id)).toEqual([])

      const before = updates.count()
      expect((await patchGlobal({ compaction: { auto: true } })).compaction).toEqual({ auto: true, reserved: 99_999 })
      expect(JSON.parse(await fs.readFile(openCodeHostConfigFile(), "utf8"))).toEqual({ compaction: { auto: true, buffer: 99_999 } })
      await updates.next(before)

      expect((await promptSession(host, { sessionID: session.id, text: "Second turn" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
      expect(await compactions(host, session.id)).toContainEqual(expect.objectContaining({ type: "compaction", status: "completed", summary: "Scripted summary." }))
    })
  }, 30_000)

  test("does not touch the running host for unrelated global patches", async () => {
    await withGlobalConfig({ compaction: { auto: true, preserve_recent_tokens: 4_000 } }, async () => {
      await using runtime = await createLiveCompactionHost()
      const { host, directory } = runtime
      await using updates = await observeConfigUpdates(host)
      const file = openCodeHostConfigFile()
      expect((await host.config.get({ location: { directory } })).some((entry) => entry.type === "document" && entry.path === file && entry.info.compaction?.keep?.tokens === 4_000)).toBe(true)
      const initial = await fs.stat(file)

      await patchGlobal({ personalization: { preferred_name: "Ada" } })
      await patchGlobal({ compaction: { auto: true } })
      await Bun.sleep(QUIET_PERIOD_MILLISECONDS)
      expect(updates.count()).toBe(0)
      const unchanged = await fs.stat(file)
      expect([unchanged.ino, unchanged.mtimeMs]).toEqual([initial.ino, initial.mtimeMs])

      await patchGlobal({ compaction: { preserve_recent_tokens: 6_000 } })
      await updates.next(0)
      const entries = await host.config.get({ location: { directory } })
      expect(entries.some((entry) => entry.type === "document" && entry.path === file && entry.info.compaction?.keep?.tokens === 6_000)).toBe(true)
    })
  }, 30_000)

  test("leaves the host config file matching the persisted settings after concurrent toggles", async () => {
    await withGlobalConfig({ compaction: { auto: true } }, async () => {
      await Promise.all([patchGlobal({ compaction: { auto: false } }), patchGlobal({ compaction: { auto: true } }), patchGlobal({ compaction: { auto: false } })])
      expect(await fs.readFile(openCodeHostConfigFile(), "utf8")).toBe(renderOpenCodeHostConfig(await Config.getGlobal()))
    })
  })
})
