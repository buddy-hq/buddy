import { createBuddyRuntimeExtension } from "../../src/runtime/buddy-extension"
import { beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { TEST_SANDBOX } from "../../../../script/test-preload"
import { createOpenCodeHost } from "@buddy/opencode-adapter/host"
import { createRuntimeExtensionPlugin } from "@buddy/opencode-adapter/extension/plugin"
import { createFreeModelControlIdentity } from "@buddy/opencode-adapter/request-identity"

const prompt = "Reply with just: ok"
const buddyPrompt = "You are Buddy, a friendly, helpful, agentic learning companion."
const modelID = "beam-free"
const requestBody = z.object({
  model: z.string(),
  stream: z.boolean().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
  tools: z
    .array(
      z.object({
        type: z.string(),
        function: z.object({ name: z.string() }).optional(),
      }),
    )
    .optional(),
})
const textParts = z.array(z.object({ type: z.string(), text: z.string().optional() }))

function messageText<T>(content: T): string {
  const text = z.string().safeParse(content)
  if (text.success) return text.data
  const parsed = textParts.safeParse(content)
  return parsed.success
    ? parsed.data
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("")
    : ""
}

describe("anonymous free-model outgoing request contract", () => {
  const requests: { headers: Headers; body: z.output<typeof requestBody> }[] = []
  let directory = ""
  let sessionID = ""

  function mainRequests() {
    return requests.filter((request) =>
      request.body.messages.some(
        (message) => message.role === "user" && messageText(message.content) === prompt,
      ),
    )
  }

  function mainRequest() {
    const request = mainRequests()[0]
    if (!request) throw new Error("The real host did not send the primary Buddy request")
    return request
  }

  function systemLines() {
    return mainRequest()
      .body.messages.filter((message) => message.role === "system")
      .flatMap((message) => messageText(message.content).split("\n"))
      .map((line) => line.trim())
  }

  beforeAll(async () => {
    const root = await fs.mkdtemp(path.join(TEST_SANDBOX.root, "free-model-contract-"))
    const paths = {
      data: path.join(root, "data"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      cache: path.join(root, "cache"),
      tmp: path.join(root, "tmp"),
    }
    const workspace = path.join(root, "Actual Working Directory")
    await Promise.all(
      [...Object.values(paths), workspace].map((entry) => fs.mkdir(entry, { recursive: true })),
    )
    directory = await fs.realpath(workspace)
    const apiKey = process.env.OPENCODE_API_KEY
    delete process.env.OPENCODE_API_KEY
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/chat/completions")
          return new Response("Unexpected fixture route", { status: 404 })
        requests.push({
          headers: new Headers(request.headers),
          body: requestBody.parse(await request.json()),
        })
        const chunk = {
          id: "chatcmpl-free-model-contract",
          object: "chat.completion.chunk",
          created: 1,
          model: modelID,
        }
        const encoder = new TextEncoder()
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (const data of [
                {
                  ...chunk,
                  choices: [
                    { index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null },
                  ],
                },
                {
                  ...chunk,
                  choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                },
              ]) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      },
    })
    try {
      const production = createBuddyRuntimeExtension()
      const extension = {
        ...production,
        async notebookPlan(directory: string) {
          const plan = await production.notebookPlan(directory)
          return {
            ...plan,
            agents: plan.agents.map((agent) =>
              agent.id === "title" || agent.id === "summary"
                ? Object.assign({}, agent, { disable: true })
                : agent,
            ),
            providers: [
              {
                id: "opencode",
                npm: "@ai-sdk/openai-compatible",
                options: { baseURL: `http://127.0.0.1:${server.port}/v1` },
                models: {
                  [modelID]: {
                    capabilities: { tools: true },
                    costs: [{ input: 0, output: 0 }],
                  },
                },
              },
            ],
            enabledProviders: ["opencode"],
            disabledProviders: [],
          }
        },
      }
      await using host = await createOpenCodeHost({
        clientName: "buddy",
        paths,
        databasePath: ":memory:",
        fetchModels: false,
        fs: { filewatcher: false, fff: false },
        config: { project: false },
        plugins: [createRuntimeExtensionPlugin(extension, async () => host)],
      })
      const session = await host.session.create({
        location: { directory },
        title: "Free model contract",
        agent: "buddy",
        model: { providerID: "opencode", id: modelID },
      })
      sessionID = session.id
      await host.session.prompt({ sessionID, text: prompt })
      await host.session.wait({ sessionID })
    } finally {
      await server.stop(true)
      if (apiKey === undefined) delete process.env.OPENCODE_API_KEY
      else process.env.OPENCODE_API_KEY = apiKey
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  test("captures the primary request for the selected free model", () => {
    expect(mainRequests()).toHaveLength(1)
    expect(mainRequest().body.model).toBe(modelID)
  })

  test("uses the anonymous public bearer token without configured credentials", () => {
    expect(mainRequest().headers.get("authorization")).toBe("Bearer public")
  })

  test("preserves the OpenCode user agent", () => {
    expect(mainRequest().headers.get("user-agent")).toMatch(/^opencode\//)
    expect(mainRequest().headers.get("user-agent")).toBe(
      createFreeModelControlIdentity(sessionID).userAgent,
    )
  })

  test("identifies the Buddy client", () => {
    expect(mainRequest().headers.get("x-opencode-client")).toBe("buddy")
  })

  test("sends the real created session ID", () => {
    expect(sessionID).toMatch(/^ses_[0-9a-f]{12}[A-Za-z0-9]{14}$/)
    expect(createFreeModelControlIdentity().sessionID).toMatch(/^ses_[0-9a-f]{12}[A-Za-z0-9]{14}$/)
    expect(mainRequest().headers.get("x-opencode-session-id")).toBe(sessionID)
    expect(mainRequest().headers.get("x-opencode-session")).toBe(sessionID)
  })

  test("requests a streaming response", () => {
    expect(mainRequest().body.stream).toBe(true)
  })

  test("opens the system environment block", () => {
    expect(systemLines()).toContain("<env>")
  })

  test("preserves the production primary Buddy persona prompt", () => {
    expect(systemLines()).toContain(buddyPrompt)
  })

  test("uses the case-sensitive Working directory label and actual session directory", () => {
    expect(directory.length).toBeGreaterThan(0)
    expect(systemLines()).toContain(`Working directory: ${directory}`)
  })

  test("closes the system environment block", () => {
    expect(systemLines()).toContain("</env>")
  })

  test("places the actual working directory inside the system environment block", () => {
    const lines = systemLines()
    const start = lines.indexOf("<env>")
    const workingDirectory = lines.indexOf(`Working directory: ${directory}`)
    const end = lines.indexOf("</env>")
    expect(start).toBeGreaterThanOrEqual(0)
    expect(workingDirectory).toBeGreaterThan(start)
    expect(end).toBeGreaterThan(workingDirectory)
  })

  test("offers the exact function tool named read", () => {
    const tools = mainRequest().body.tools ?? []
    const read = tools.filter((tool) => tool.function?.name === "read")
    expect(read).toHaveLength(1)
    expect(read[0]?.type).toBe("function")
  })
})
