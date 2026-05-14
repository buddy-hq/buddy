import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

describe("model runtime context", () => {
  test("falls back to request model runtime when provider lookup misses", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const sessionID = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () => {
        const session = await OpenCodeSession.create({})
        return session.id
      },
    })

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID,
      },
      body: {
        content: "Can you inspect images in this session?",
        persona: "buddy",
        model: {
          providerID: "missing-provider",
          modelID: "missing-model",
        },
        modelRuntime: {
          providerID: "missing-provider",
          modelID: "missing-model",
          contextWindow: 321_000,
          inputWindow: 123_000,
          outputWindow: 8_000,
          image: true,
        },
      },
      projectConfig: config,
    })

    expect(result.transformed).not.toHaveProperty("modelRuntime")
    expect(typeof result.transformed.system).toBe("string")
    expect(result.transformed.system).toContain("Active model: missing-provider/missing-model")
    expect(result.transformed.system).toContain("Context window: 321000")
    expect(result.transformed.system).toContain("Input window: 123000")
    expect(result.transformed.system).toContain("Output window: 8000")
    expect(result.transformed.system).toContain(
      "vision: yes [this model supports vision; you can use read tool to view images]",
    )
  })
})
