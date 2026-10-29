import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Hono } from "hono"
import z from "zod"
import { GlobalRoutes } from "../../src/routes/global"
import { Config } from "../../src/config"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import {
  openCodeHostConfigFile,
  renderOpenCodeHostConfig,
  syncOpenCodeHostConfig,
} from "../../src/config/runtime/opencode-host-config"
import { createConfigConformanceHarness } from "../conformance/harness-config"
import { temporaryEnvironment } from "../helpers/temporary-environment"

const app = new Hono().route("/api/global", GlobalRoutes)
const headers = { "content-type": "application/json" }

async function withGlobalConfig<T>(config: Config.Info, run: () => Promise<T>): Promise<T> {
  const previous = await Config.getGlobal()
  try {
    await Config.replaceGlobal(Config.Info.parse({ ...previous, ...config }))
    return await run()
  } finally {
    await Config.replaceGlobal(previous)
  }
}

async function patchGlobal(body: Config.Info) {
  const response = await app.request("/api/global/config", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(200)
  return Config.Info.parse(await response.json())
}

describe("global compaction settings on a running host", () => {
  test("applies an auto-compaction toggle from the settings route without restarting the host", async () => {
    using watchers = temporaryEnvironment({ OPENCODE_FILEWATCHER_DISABLE: "0" })
    void watchers
    await using harness = await createConfigConformanceHarness()
    const notebook = await harness.notebook("live-compaction")
    const { directory } = notebook
    const session = await notebook.json("/session", z.object({ id: z.string() }), {
      body: { title: "Live compaction" },
    })
    const runtime = await getAgentRuntime()
    const scope = { directory, sessionID: session.id }
    await harness.patchGlobalConfig({ compaction: { auto: false, reserved: 99_999 } })

    expect(
      await runtime.execution.prompt(
        { sessionID: session.id, text: "First turn" },
        { directory, signal: AbortSignal.timeout(10_000) },
      ),
    ).toMatchObject({ ok: true })
    expect(
      (await runtime.conversations.history(scope)).items
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "compaction"),
    ).toEqual([])

    expect((await harness.patchGlobalConfig({ compaction: { auto: true } })).compaction).toEqual({
      auto: true,
      reserved: 99_999,
    })
    expect(JSON.parse(await fs.readFile(openCodeHostConfigFile(), "utf8"))).toEqual({
      compaction: { auto: true, buffer: 99_999 },
    })

    expect(
      await runtime.execution.prompt(
        { sessionID: session.id, text: "Second turn" },
        { directory, signal: AbortSignal.timeout(10_000) },
      ),
    ).toMatchObject({ ok: true })
    expect(
      (await runtime.conversations.history(scope)).items.flatMap((message) => message.parts),
    ).toContainEqual(
      expect.objectContaining({ type: "compaction", auto: true, status: "completed" }),
    )
  }, 30_000)

  test("leaves the host config file alone for unrelated and unchanged global patches", async () => {
    await withGlobalConfig(
      { compaction: { auto: true, preserve_recent_tokens: 4_000 } },
      async () => {
        const file = await syncOpenCodeHostConfig()
        const original = `${await fs.readFile(file, "utf8")}\n`
        await fs.writeFile(file, original)

        await patchGlobal({ personalization: { preferred_name: "Ada" } })
        expect(await fs.readFile(file, "utf8")).toBe(original)
        await patchGlobal({ compaction: { auto: true } })
        expect(await fs.readFile(file, "utf8")).toBe(original)

        await patchGlobal({ compaction: { preserve_recent_tokens: 6_000 } })
        expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({
          compaction: { auto: true, keep: { tokens: 6_000 } },
        })
      },
    )
  }, 30_000)

  test("leaves the host config file matching the persisted settings after concurrent toggles", async () => {
    await withGlobalConfig({ compaction: { auto: true } }, async () => {
      await Promise.all([
        patchGlobal({ compaction: { auto: false } }),
        patchGlobal({ compaction: { auto: true } }),
        patchGlobal({ compaction: { auto: false } }),
      ])
      expect(await fs.readFile(openCodeHostConfigFile(), "utf8")).toBe(
        renderOpenCodeHostConfig(await Config.getGlobal()),
      )
    })
  })
})
