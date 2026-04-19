import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { app } from "../../src/index.ts"
import type { Config } from "../../src/config"
import { tmpdir } from "../helpers/tmpdir"

type Capture = {
  url: URL
  headers: Headers
  body: Record<string, unknown>
}

type OpenAiProviderConfig = NonNullable<NonNullable<Config.Info["provider"]>["openai"]>
type OpenAiProviderModelConfig = NonNullable<OpenAiProviderConfig["models"]>[string]

const serverState = {
  server: null as ReturnType<typeof Bun.serve> | null,
  captures: [] as Capture[],
}

function createEventStream(chunks: unknown[], includeDone = false) {
  const lines = chunks.map(
    (chunk) => `data: ${typeof chunk === "string" ? chunk : JSON.stringify(chunk)}`,
  )
  if (includeDone) {
    lines.push("data: [DONE]")
  }
  const payload = lines.join("\n\n") + "\n\n"
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

function createEventResponse(chunks: unknown[], includeDone = false) {
  return new Response(createEventStream(chunks, includeDone), {
    headers: {
      "content-type": "text/event-stream",
    },
  })
}

async function loadOpenAiFixtureModel() {
  const fixturePath = path.resolve(
    import.meta.dir,
    "../../../../vendor/opencode/packages/opencode/test/tool/fixtures/models-api.json",
  )
  const data = (await Bun.file(fixturePath).json()) as Record<
    string,
    {
      models?: Record<string, OpenAiProviderModelConfig>
    }
  >
  const provider = data.openai
  if (!provider?.models || !("gpt-5.2" in provider.models)) {
    throw new Error("Missing openai/gpt-5.2 fixture")
  }
  return provider.models["gpt-5.2"]
}

async function readTeachingState(input: { directory: string; sessionID: string }) {
  const response = await app.request(`/api/session/${input.sessionID}/teaching-state`, {
    method: "GET",
    headers: {
      "x-buddy-directory": input.directory,
    },
  })
  return response
}

beforeAll(() => {
  serverState.server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const body = (await req.json()) as Record<string, unknown>
      serverState.captures.push({ url, headers: req.headers, body })

      if (!url.pathname.endsWith("/responses")) {
        return new Response("not found", { status: 404 })
      }

      return createEventResponse(
        [
          {
            type: "response.created",
            response: {
              id: `resp-${serverState.captures.length}`,
              created_at: Math.floor(Date.now() / 1000),
              model: typeof body.model === "string" ? body.model : "gpt-5.2",
              service_tier: null,
            },
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: {
              id: `msg-${serverState.captures.length}`,
              type: "message",
              role: "assistant",
              status: "in_progress",
              content: [],
            },
          },
          {
            type: "response.output_text.delta",
            item_id: `msg-${serverState.captures.length}`,
            delta: "Smoke reply",
            logprobs: null,
          },
          {
            type: "response.completed",
            response: {
              incomplete_details: null,
              usage: {
                input_tokens: 1,
                input_tokens_details: null,
                output_tokens: 1,
                output_tokens_details: null,
              },
              service_tier: null,
            },
          },
        ],
        true,
      )
    },
  })
})

beforeEach(() => {
  serverState.captures.length = 0
})

afterAll(() => {
  serverState.server?.stop()
})

describe("system prompt smoke", () => {
  test(
    "teaching-state exposes the captured runtime system prompt with Buddy AGENTS instructions",
    async () => {
      const server = serverState.server
      if (!server) {
        throw new Error("mock provider server not started")
      }

      const previousApiKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = "test-openai-key"

      try {
        const model = await loadOpenAiFixtureModel()
        await using project = await tmpdir({
          git: true,
          config: {
            enabled_providers: ["openai"],
            model: "openai/gpt-5.2",
            provider: {
              openai: {
                name: "OpenAI",
                env: ["OPENAI_API_KEY"],
                npm: "@ai-sdk/openai",
                api: "https://api.openai.com/v1",
                models: {
                  "gpt-5.2": model,
                },
                options: {
                  apiKey: "test-openai-key",
                  baseURL: `${server.url.origin}/v1`,
                },
              },
            },
          },
        })

        const globalAgentsDir = path.join(process.env.BUDDY_TEST_HOME ?? "", ".buddy")
        const globalAgentsPath = path.join(globalAgentsDir, "AGENTS.md")
        const localAgentsPath = path.join(project.path, "AGENTS.md")
        await fs.mkdir(globalAgentsDir, { recursive: true })
        await fs.writeFile(globalAgentsPath, "Global smoke instruction", "utf8")
        await fs.writeFile(localAgentsPath, "Local smoke instruction", "utf8")
        const realGlobalAgentsPath = await fs.realpath(globalAgentsPath)
        const realLocalAgentsPath = await fs.realpath(localAgentsPath)

        const createSessionResponse = await app.request("/api/session", {
          method: "POST",
          headers: {
            "x-buddy-directory": project.path,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        })
        expect(createSessionResponse.status).toBe(200)
        const session = (await createSessionResponse.json()) as { id: string }

        const promptResponse = await app.request(`/api/session/${session.id}/message`, {
          method: "POST",
          headers: {
            "x-buddy-directory": project.path,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: "Help me learn Shape Up.",
            persona: "buddy",
          }),
        })
        expect(promptResponse.status).toBe(200)
        await promptResponse.json()

        expect(serverState.captures.length).toBeGreaterThan(0)
        const assistantCapture = serverState.captures.findLast(
          (capture) => capture.body.model === "gpt-5.2",
        )
        expect(assistantCapture?.url.pathname.endsWith("/responses")).toBe(true)

        let fullSystemPrompt: string | undefined
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const teachingStateResponse = await readTeachingState({
            directory: project.path,
            sessionID: session.id,
          })
          expect(teachingStateResponse.status).toBe(200)
          const teachingState = (await teachingStateResponse.json()) as {
            lastLlmOutbound?: {
              fullSystemPrompt?: string
            }
          }
          fullSystemPrompt = teachingState.lastLlmOutbound?.fullSystemPrompt
          if (fullSystemPrompt) {
            break
          }
          await Bun.sleep(25)
        }

        expect(fullSystemPrompt).toBeDefined()
        if (!fullSystemPrompt) {
          throw new Error("Missing captured system prompt")
        }
        expect(fullSystemPrompt).toContain(`Instructions from: ${realGlobalAgentsPath}`)
        expect(fullSystemPrompt).toContain("Global smoke instruction")
        expect(fullSystemPrompt).toContain(`Instructions from: ${realLocalAgentsPath}`)
        expect(fullSystemPrompt).toContain("Local smoke instruction")
      } finally {
        if (previousApiKey === undefined) {
          delete process.env.OPENAI_API_KEY
        } else {
          process.env.OPENAI_API_KEY = previousApiKey
        }
      }
    },
    { timeout: 20000 },
  )
})
