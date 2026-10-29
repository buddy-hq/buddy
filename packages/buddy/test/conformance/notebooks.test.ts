import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import z from "zod"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { Session } from "@buddy/transcript-contract/session"
import { app } from "../../src/app"
import { projectConfigFile } from "../helpers/project-config"
import { tmpdir } from "../helpers/tmpdir"
import { createRuntimeHarness, messageText, patchModel, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness()
})
afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
})

async function otherNotebook(config: string) {
  const directory = await tmpdir({
    init: async (directory) => {
      const configFile = projectConfigFile(directory)
      await fs.mkdir(path.dirname(configFile), { recursive: true })
      await fs.writeFile(configFile, config)
    },
  })
  async function request(route: string, init: RequestInit = {}) {
    return app.request(`/api${route}`, {
      ...init,
      headers: { "x-buddy-directory": directory.path, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
  }
  try {
    const response = await request("/session", {
      method: "POST",
      body: JSON.stringify({ title: "Other notebook", agent: "conformance-runner" }),
    })
    expect(response.status).toBe(200)
    const session = Schema.decodeUnknownSync(Session)(await response.json())
    return {
      session,
      prompt(text: string) {
        return request(`/session/${session.id}/message`, {
          method: "POST",
          body: JSON.stringify({
            agent: "conformance-runner",
            content: scenario({ kind: "reply", text }),
          }),
        })
      },
      async [Symbol.asyncDispose]() {
        try {
          expect((await request(`/session/${session.id}`, { method: "DELETE" })).status).toBe(200)
        } finally {
          await directory[Symbol.asyncDispose]()
        }
      },
    }
  } catch (error) {
    await directory[Symbol.asyncDispose]()
    throw error
  }
}

async function completedReply(response: Response, text: string) {
  expect(response.status).toBe(200)
  const message = Schema.decodeUnknownSync(MessageWithParts)(await response.json())
  expect(message.info).toMatchObject({
    role: "assistant",
    finish: "stop",
    time: { completed: expect.any(Number) },
  })
  expect(messageText(message)).toBe(text)
  return message
}

describe("Notebook scope", () => {
  test("a notebook's default model is used without changing another notebook's default", async () => {
    const configFile = projectConfigFile(api.directory)
    const original = await fs.readFile(configFile, "utf8")
    try {
      const config = z.record(z.string(), z.json()).parse(JSON.parse(original))
      await fs.writeFile(
        configFile,
        JSON.stringify({ ...config, model: `${patchModel.providerID}/${patchModel.modelID}` }),
      )
      const session = await api.create()
      const changed = await completedReply(
        await api.prompt(session.id, scenario({ kind: "reply", text: "Notebook model answer" })),
        "Notebook model answer",
      )
      expect(changed.info).toMatchObject({
        providerID: "conformance",
        modelID: "gpt-5-conformance",
      })
      await using other = await otherNotebook(original)
      const unchanged = await completedReply(
        await other.prompt("Other notebook model answer"),
        "Other notebook model answer",
      )
      expect(unchanged.info).toMatchObject({ providerID: "conformance", modelID: "chat" })
    } finally {
      await fs.writeFile(configFile, original)
    }
  })

  test("invalid notebook config reports an actionable error, isolates failure, and recovers when restored", async () => {
    const configFile = projectConfigFile(api.directory)
    const original = await fs.readFile(configFile, "utf8")
    await using other = await otherNotebook(original)
    const session = await api.create()
    let rejected: Response
    let error: { error: string; code: string; details?: { path?: string; file?: string } }
    try {
      await fs.writeFile(
        configFile,
        JSON.stringify({
          provider: {
            openai: { models: { gpt: { options: { compaction: { type: "automatic" } } } } },
          },
        }),
      )
      rejected = await api.request(`/session/${session.id}/prompt_async`, {
        method: "POST",
        body: JSON.stringify({
          agent: "conformance-runner",
          content: scenario({ kind: "reply", text: "Invalid notebook must reject" }),
        }),
      })
      error = z
        .object({
          error: z.string(),
          code: z.string(),
          details: z
            .object({ path: z.string().optional(), file: z.string().optional() })
            .optional(),
        })
        .parse(await rejected.json())
      await completedReply(
        await other.prompt("Other notebook still answers"),
        "Other notebook still answers",
      )
    } finally {
      await fs.writeFile(configFile, original)
    }
    await completedReply(
      await api.prompt(session.id, scenario({ kind: "reply", text: "Restored notebook answers" })),
      "Restored notebook answers",
    )
    expect(rejected.status).toBe(400)
    expect(error.code).toBe("config.invalid")
    expect(error.error).toMatch(/config/iu)
    expect(`${error.error} ${error.details?.path ?? ""}`).toContain(
      "models.gpt.settings.compaction",
    )
    const reportedFile = error.details?.file
    expect(reportedFile ? await fs.realpath(reportedFile) : undefined).toBe(
      await fs.realpath(configFile),
    )
  })
})
