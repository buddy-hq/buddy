import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"
import { requireString } from "../helpers/parse"

const HTML_TAG_NAMES = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
])

function countNonHtmlTags(source: string) {
  const openings = new Map<string, number>()
  const closings = new Map<string, number>()

  for (const match of source.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const isClosing = match[1] === "/"
    const name = match[2]?.toLowerCase()
    if (!name || HTML_TAG_NAMES.has(name)) {
      continue
    }
    const target = isClosing ? closings : openings
    target.set(name, (target.get(name) ?? 0) + 1)
  }

  return { openings, closings }
}

describe("model runtime context", () => {
  test("keeps an explicit persona authoritative over the opposite primary use", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_explicit_persona",
      },
      body: {
        content: "Help me understand fractions.",
        persona: "buddy",
      },
      projectConfig: {
        ...config,
        personalization: {
          primary_use: "teach",
        },
      },
    })

    expect(result.transformed.agent).toBe("buddy")
    expect(result.nextTeachingState?.persona).toBe("buddy")
    expect(result.transformed.system).not.toContain("Primary use: teaching")

    const followup = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_explicit_persona",
      },
      body: {
        content: "Give me another example.",
      },
      projectConfig: {
        ...config,
        personalization: {
          primary_use: "teach",
        },
      },
      previousState: result.nextTeachingState,
    })

    expect(followup.transformed.agent).toBe("buddy")
    expect(followup.nextTeachingState?.persona).toBe("buddy")
  })

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
    const system = requireString(result.transformed.system, "system")
    expect(system).toContain("Active model: missing-provider/missing-model")
    expect(system).toContain("Context window: 321000")
    expect(system).toContain("Input window: 123000")
    expect(system).toContain("Output window: 8000")
    expect(system).toContain(
      "vision: yes [this model supports vision; you can use read tool to view images]",
    )
  })

  test("preserves non-html tag structure in the assembled system prompt", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_tag_preservation",
      },
      body: {
        content: "Give me a short overview.",
        persona: "buddy",
      },
      projectConfig: config,
    })

    const systemPrompt = requireString(result.transformed.system, "system")
    const { openings, closings } = countNonHtmlTags(systemPrompt)

    expect(openings.size).toBeGreaterThan(0)
    expect(closings.size).toBeGreaterThan(0)

    for (const [tagName, count] of openings) {
      expect(closings.get(tagName)).toBe(count)
    }
  })
})
