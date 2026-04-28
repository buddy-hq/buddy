import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionID } from "@buddy/opencode-adapter/id"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import { dynamicPedagogyReflectionTool } from "../../src/learning/tools/dynamic-learning-tools"
import { grantedDynamicLearningToolIDsForSession } from "../../src/learning/tools/dynamic-learning-tool-grants"
import { registerRuntimeTools } from "../../src/learning/tools/register-runtime-tools"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID = dynamicPedagogyReflectionTool.id

type Capture = {
  url: URL
  headers: Headers
  body: Record<string, unknown>
}

type OpenAiProviderConfig = NonNullable<
  NonNullable<import("../../src/config").Config.Info["provider"]>["openai"]
>
type OpenAiProviderModelConfig = NonNullable<OpenAiProviderConfig["models"]>[string]

const TEST_MODEL_ID = "gpt-5.2" as const
const TEST_OPENAI_KEY = "test-openai-key" as const
const assistantRequestQueue: unknown[][] = []
const ARCHIVE_TEST_FLAGS = {
  pedagogy: false,
  curriculum: false,
  knowledgeGraph: false,
  figures: false,
  freeformFigures: false,
  mermaid: false,
  goals: false,
  learner: false,
  toolDiscovery: true,
  teaching: false,
  math: false,
  questionSet: false,
  flashcard: false,
} as const

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

function responseCreated(id: string, model: string) {
  return {
    type: "response.created",
    response: {
      id,
      created_at: Math.floor(Date.now() / 1000),
      model,
      service_tier: null,
    },
  }
}

function responseCompleted() {
  return {
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
  }
}

function createToolCallResponse(input: {
  responseId: string
  itemId: string
  callId: string
  toolName: string
  args: Record<string, unknown>
  model?: string
}) {
  const argsText = JSON.stringify(input.args)

  return [
    responseCreated(input.responseId, input.model ?? TEST_MODEL_ID),
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: input.itemId,
        call_id: input.callId,
        name: input.toolName,
        arguments: "",
        status: "in_progress",
      },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 0,
      item_id: input.itemId,
      delta: argsText,
    },
    {
      type: "response.function_call_arguments.done",
      output_index: 0,
      item_id: input.itemId,
      arguments: argsText,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: input.itemId,
        call_id: input.callId,
        name: input.toolName,
        arguments: argsText,
        status: "completed",
      },
    },
    responseCompleted(),
  ]
}

function createTextResponse(input: {
  responseId: string
  messageId: string
  text: string
  model?: string
}) {
  return [
    responseCreated(input.responseId, input.model ?? TEST_MODEL_ID),
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: input.messageId,
        type: "message",
        role: "assistant",
        status: "in_progress",
        content: [],
      },
    },
    {
      type: "response.output_text.delta",
      item_id: input.messageId,
      delta: input.text,
      logprobs: null,
    },
    responseCompleted(),
  ]
}

function isTitleRequest(body: Record<string, unknown>): boolean {
  return JSON.stringify(body).includes("Generate a title for this conversation")
}

function queueAssistantResponse(chunks: unknown[]) {
  assistantRequestQueue.push(chunks)
}

function nextAssistantResponse(): unknown[] {
  const next = assistantRequestQueue.shift()
  if (next) return next

  return createTextResponse({
    responseId: "resp-fallback",
    messageId: "msg-fallback",
    text: "Fallback reply",
  })
}

function toolNames(body: Record<string, unknown>): string[] {
  const tools = body.tools
  if (!Array.isArray(tools)) return []

  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return []
    if ("name" in tool && typeof tool.name === "string") {
      return [tool.name]
    }
    if (!("function" in tool) || !tool.function || typeof tool.function !== "object") return []
    if (!("name" in tool.function) || typeof tool.function.name !== "string") return []
    return [tool.function.name]
  })
}

function hasBuddyToolUi(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((item) => hasBuddyToolUi(item))

  if (
    "buddy" in value &&
    value.buddy &&
    typeof value.buddy === "object" &&
    !Array.isArray(value.buddy) &&
    "toolUi" in value.buddy
  ) {
    return true
  }

  return Object.values(value).some((item) => hasBuddyToolUi(item))
}

function resultHasText(
  result: {
    parts: Array<
      | {
          type: "text"
          text: string
        }
      | {
          type: string
        }
    >
  },
  text: string,
): boolean {
  return result.parts.some((part) => part.type === "text" && "text" in part && part.text === text)
}

async function loadOpenAiFixtureModel(): Promise<OpenAiProviderModelConfig> {
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
  if (!provider?.models || !(TEST_MODEL_ID in provider.models)) {
    throw new Error(`Missing openai/${TEST_MODEL_ID} fixture`)
  }
  return provider.models[TEST_MODEL_ID]
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

      if (isTitleRequest(body)) {
        return createEventResponse(
          createTextResponse({
            responseId: "resp-title",
            messageId: "msg-title",
            text: "Dynamic reflection rendering test",
          }),
          true,
        )
      }

      return createEventResponse(nextAssistantResponse(), true)
    },
  })
})

beforeEach(() => {
  serverState.captures.length = 0
  assistantRequestQueue.length = 0
})

afterAll(() => {
  serverState.server?.stop()
})

describe("dynamic tool live session patch", () => {
  test("Session.setPermission mutates an already-returned session object in place", async () => {
    await using project = await tmpdir({ git: true })

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const session = await OpenCodeSession.create({})

        expect(session.permission).toBeUndefined()

        const nextPermission = [
          {
            permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
            pattern: "*",
            action: "allow" as const,
          },
        ]

        await OpenCodeSession.setPermission({
          sessionID: SessionID.make(session.id),
          permission: nextPermission,
        })

        expect(session.permission).toEqual(nextPermission)

        const again = await OpenCodeSession.get(SessionID.make(session.id))
        expect(again).toBe(session)
        expect(again.permission).toEqual(nextPermission)

        await OpenCodeSession.setTitle({
          sessionID: SessionID.make(session.id),
          title: "Retitled session",
        })
        expect(session.title).toBe("Retitled session")

        const archivedAt = Date.now()
        await OpenCodeSession.setArchived({
          sessionID: SessionID.make(session.id),
          time: archivedAt,
        })
        expect(session.time.archived).toBe(archivedAt)
      },
    })
  })

  test("Session.children returns canonical live session objects", async () => {
    await using project = await tmpdir({ git: true })

    await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const parent = await OpenCodeSession.create({})
        const child = await OpenCodeSession.create({
          parentID: SessionID.make(parent.id),
        })

        const children = await OpenCodeSession.children(SessionID.make(parent.id))
        const listedChild = children.find((session) => session.id === child.id)

        expect(listedChild).toBeDefined()
        if (!listedChild) {
          throw new Error("expected child session to be listed")
        }

        await OpenCodeSession.setTitle({
          sessionID: SessionID.make(child.id),
          title: "Child title updated",
        })

        expect(listedChild.title).toBe("Child title updated")

        const fetchedChild = await OpenCodeSession.get(SessionID.make(child.id))
        expect(fetchedChild).toBe(listedChild)
      },
    })
  })

  test("archiving a session clears directory-visible dynamic tools without waiting for another turn", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, ARCHIVE_TEST_FLAGS)

    const session = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const createdSession = await OpenCodeSession.create({})
        const searchTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_search",
        )
        const loadTool = requireTool(
          await ToolRegistry.tools(TEST_TOOL_MODEL),
          "learning_tool_load",
        )

        await searchTool.execute(
          { query: "reflection" },
          createToolContext({
            sessionID: createdSession.id,
            messageID: "msg_dynamic_tool_search_archive",
            agent: "buddy",
          }),
        )
        await loadTool.execute(
          { toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID] },
          createToolContext({
            sessionID: createdSession.id,
            messageID: "msg_dynamic_tool_load_archive",
            agent: "buddy",
          }),
        )

        return createdSession
      },
    })

    const beforeArchive = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        return (await ToolRegistry.tools(TEST_TOOL_MODEL)).map((tool) => tool.id)
      },
    })
    expect(beforeArchive).toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)

    const archiveResponse = await app.request(
      `/api/session/${session.id}?directory=${encodeURIComponent(project.path)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          time: {
            archived: Date.now(),
          },
        }),
      },
    )

    expect(archiveResponse.status).toBe(200)

    const afterArchive = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        return (await ToolRegistry.tools(TEST_TOOL_MODEL)).map((tool) => tool.id)
      },
    })
    expect(afterArchive).not.toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
  })

  test(
    "learning_tool_load exposes a dynamic tool to the next model request in the same assistant turn",
    async () => {
      const server = serverState.server
      if (!server) {
        throw new Error("mock provider server not started")
      }

      const previousApiKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = TEST_OPENAI_KEY

      try {
        const model = await loadOpenAiFixtureModel()

        await using project = await tmpdir({
          git: true,
          config: {
            enabled_providers: ["openai"],
            model: `openai/${TEST_MODEL_ID}`,
            provider: {
              openai: {
                name: "OpenAI",
                env: ["OPENAI_API_KEY"],
                npm: "@ai-sdk/openai",
                api: "https://api.openai.com/v1",
                models: {
                  [TEST_MODEL_ID]: model,
                },
                options: {
                  apiKey: TEST_OPENAI_KEY,
                  baseURL: `${server.url.origin}/v1`,
                },
              },
            },
          },
        })

        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-search",
            itemId: "fc-search",
            callId: "call-search",
            toolName: "learning_tool_search",
            args: {
              query: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
              limit: 3,
            },
          }),
        )
        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-load",
            itemId: "fc-load",
            callId: "call-load",
            toolName: "learning_tool_load",
            args: {
              toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
            },
          }),
        )
        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-dynamic",
            itemId: "fc-dynamic",
            callId: "call-dynamic",
            toolName: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
            args: {
              topic: "recursive functions",
            },
          }),
        )
        queueAssistantResponse(
          createTextResponse({
            responseId: "resp-final",
            messageId: "msg-final",
            text: "Dynamic tool call completed.",
          }),
        )

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
            content: `Search for the dynamic learning tool with ID ${DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID}. If found, load it and call it.`,
            persona: "buddy",
          }),
        })

        expect(promptResponse.status).toBe(200)

        const result = (await promptResponse.json()) as {
          info: {
            finish?: string
            error?: unknown
          }
          parts: Array<
            | {
                type: "text"
                text: string
              }
            | {
                type: "tool"
                tool: string
                state: {
                  status: string
                }
              }
            | {
                type: string
              }
          >
        }
        const finalSession = await OpenCodeInstance.provide({
          directory: project.path,
          async fn() {
            return OpenCodeSession.get(SessionID.make(session.id))
          },
        })

        const assistantCaptures = serverState.captures.filter(
          (capture) => !isTitleRequest(capture.body) && capture.body.model === TEST_MODEL_ID,
        )
        const assistantToolNames = assistantCaptures.map((capture) => toolNames(capture.body))

        expect(assistantCaptures.length).toBeGreaterThanOrEqual(4)
        expect(assistantToolNames[1] ?? []).not.toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)
        if (!(assistantToolNames[2] ?? []).includes(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)) {
          throw new Error(
            [
              "Loaded dynamic tool did not appear in the next outbound model tool list.",
              `Captured tool lists: ${JSON.stringify(assistantToolNames)}`,
              `Captured raw tools: ${JSON.stringify(assistantCaptures.map((capture) => capture.body.tools ?? null))}`,
              `Persisted session permission: ${JSON.stringify(finalSession.permission ?? [])}`,
            ].join("\n"),
          )
        }

        expect(result.info.error).toBeUndefined()
        expect(finalSession.permission ?? []).toContainEqual({
          permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
          pattern: "*",
          action: "allow",
        })
        expect(
          result.parts.some(
            (part) =>
              part.type === "text" &&
              "text" in part &&
              part.text.includes("Dynamic tool call completed."),
          ),
        ).toBe(true)
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

  test(
    "loaded dynamic tools remain callable on later user turns in the same session",
    async () => {
      const server = serverState.server
      if (!server) {
        throw new Error("mock provider server not started")
      }

      const previousApiKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = TEST_OPENAI_KEY

      try {
        const model = await loadOpenAiFixtureModel()

        await using project = await tmpdir({
          git: true,
          config: {
            enabled_providers: ["openai"],
            model: `openai/${TEST_MODEL_ID}`,
            provider: {
              openai: {
                name: "OpenAI",
                env: ["OPENAI_API_KEY"],
                npm: "@ai-sdk/openai",
                api: "https://api.openai.com/v1",
                models: {
                  [TEST_MODEL_ID]: model,
                },
                options: {
                  apiKey: TEST_OPENAI_KEY,
                  baseURL: `${server.url.origin}/v1`,
                },
              },
            },
          },
        })

        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-search-turn1",
            itemId: "fc-search-turn1",
            callId: "call-search-turn1",
            toolName: "learning_tool_search",
            args: {
              query: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
              limit: 3,
            },
          }),
        )
        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-load-turn1",
            itemId: "fc-load-turn1",
            callId: "call-load-turn1",
            toolName: "learning_tool_load",
            args: {
              toolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
            },
          }),
        )
        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-dynamic-turn1",
            itemId: "fc-dynamic-turn1",
            callId: "call-dynamic-turn1",
            toolName: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
            args: {
              topic: "recursive functions",
            },
          }),
        )
        queueAssistantResponse(
          createTextResponse({
            responseId: "resp-final-turn1",
            messageId: "msg-final-turn1",
            text: "First dynamic tool call completed.",
          }),
        )

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
        const firstPromptResponse = await app.request(`/api/session/${session.id}/message`, {
          method: "POST",
          headers: {
            "x-buddy-directory": project.path,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: `Search for the dynamic learning tool with ID ${DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID}. If found, load it and call it.`,
            persona: "buddy",
          }),
        })

        expect(firstPromptResponse.status).toBe(200)
        const firstResult = (await firstPromptResponse.json()) as {
          info: {
            finish?: string
            error?: unknown
          }
          parts: Array<
            | {
                type: "text"
                text: string
              }
            | {
                type: "tool"
                tool: string
                state: {
                  status: string
                }
              }
            | {
                type: string
              }
          >
        }
        const firstAssistantCaptures = serverState.captures.filter(
          (capture) => !isTitleRequest(capture.body) && capture.body.model === TEST_MODEL_ID,
        )
        expect(resultHasText(firstResult, "First dynamic tool call completed.")).toBe(true)
        expect(
          await grantedDynamicLearningToolIDsForSession({
            directory: project.path,
            sessionID: session.id,
          }),
        ).toContain(DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID)

        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-dynamic-turn2",
            itemId: "fc-dynamic-turn2",
            callId: "call-dynamic-turn2",
            toolName: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
            args: {
              learnerRequest: "Use the already loaded reflection tool again.",
            },
          }),
        )
        queueAssistantResponse(
          createTextResponse({
            responseId: "resp-final-turn2",
            messageId: "msg-final-turn2",
            text: "Second dynamic tool call completed.",
          }),
        )

        const secondPromptResponse = await app.request(`/api/session/${session.id}/message`, {
          method: "POST",
          headers: {
            "x-buddy-directory": project.path,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: "Call the already loaded dynamic reflection tool again.",
            persona: "buddy",
          }),
        })

        expect(secondPromptResponse.status).toBe(200)

        const secondResult = (await secondPromptResponse.json()) as {
          info: {
            finish?: string
            error?: unknown
          }
          parts: Array<
            | {
                type: "text"
                text: string
              }
            | {
                type: "tool"
                tool: string
                state: {
                  status: string
                }
              }
            | {
                type: string
              }
          >
        }
        const secondAssistantCaptures = serverState.captures
          .filter(
            (capture) => !isTitleRequest(capture.body) && capture.body.model === TEST_MODEL_ID,
          )
          .slice(firstAssistantCaptures.length)
        const finalSession = await OpenCodeInstance.provide({
          directory: project.path,
          async fn() {
            return OpenCodeSession.get(SessionID.make(session.id))
          },
        })

        expect(secondAssistantCaptures.length).toBeGreaterThanOrEqual(2)
        expect(toolNames(secondAssistantCaptures[0]?.body ?? {})).toContain(
          DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
        )
        expect(resultHasText(secondResult, "Second dynamic tool call completed.")).toBe(true)
        expect(finalSession.permission ?? []).toContainEqual({
          permission: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
          pattern: "*",
          action: "allow",
        })
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

  test(
    "dynamic tool UI metadata survives tool lifecycle parts and is stripped from provider replay",
    async () => {
      const server = serverState.server
      if (!server) {
        throw new Error("mock provider server not started")
      }

      const previousApiKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = TEST_OPENAI_KEY

      try {
        const model = await loadOpenAiFixtureModel()

        await using project = await tmpdir({
          git: true,
          config: {
            enabled_providers: ["openai"],
            model: `openai/${TEST_MODEL_ID}`,
            provider: {
              openai: {
                name: "OpenAI",
                env: ["OPENAI_API_KEY"],
                npm: "@ai-sdk/openai",
                api: "https://api.openai.com/v1",
                models: {
                  [TEST_MODEL_ID]: model,
                },
                options: {
                  apiKey: TEST_OPENAI_KEY,
                  baseURL: `${server.url.origin}/v1`,
                },
              },
            },
          },
        })

        queueAssistantResponse(
          createToolCallResponse({
            responseId: "resp-search-ui",
            itemId: "fc-search-ui",
            callId: "call-search-ui",
            toolName: "learning_tool_search",
            args: {
              query: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
              limit: 1,
            },
          }),
        )
        queueAssistantResponse(
          createTextResponse({
            responseId: "resp-search-ui-final",
            messageId: "msg-search-ui-final",
            text: "Search done.",
          }),
        )

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
            content: `Search for ${DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID}.`,
            persona: "buddy",
          }),
        })

        expect(promptResponse.status).toBe(200)

        await promptResponse.json()

        const sessionMessages = await OpenCodeInstance.provide({
          directory: project.path,
          async fn() {
            return OpenCodeSession.messages({ sessionID: SessionID.make(session.id) })
          },
        })
        const searchToolPart = sessionMessages
          .flatMap((message) => message.parts)
          .find(
            (
              part,
            ): part is Extract<
              (typeof sessionMessages)[number]["parts"][number],
              { type: "tool" }
            > => part.type === "tool" && part.tool === "learning_tool_search",
          )

        expect(searchToolPart).toBeDefined()
        expect(searchToolPart?.metadata).toMatchObject({
          buddy: {
            toolUi: {
              presentation: "hidden-summary",
              labels: {
                idle: "Search learning tools",
                running: "Searching learning tools",
              },
            },
          },
        })
        expect(
          (searchToolPart?.state as { metadata?: Record<string, unknown> } | undefined)?.metadata,
        ).toMatchObject({
          query: DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID,
          persona: "buddy",
          workspaceState: "chat",
          matchedToolIds: [DYNAMIC_PEDAGOGY_REFLECTION_TOOL_ID],
          matches: expect.any(Array),
          filtered: expect.any(Array),
          nextTool: "learning_tool_load",
          buddy: {
            toolUi: {
              presentation: "hidden-summary",
              labels: {
                idle: "Search learning tools",
                running: "Searching learning tools",
              },
            },
          },
        })

        const assistantCaptures = serverState.captures.filter(
          (capture) => capture.body.model === TEST_MODEL_ID,
        )
        expect(assistantCaptures.length).toBeGreaterThan(0)
        expect(assistantCaptures.some((capture) => isTitleRequest(capture.body))).toBe(true)
        expect(assistantCaptures.some((capture) => hasBuddyToolUi(capture.body))).toBe(false)
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
