import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"
import { requireJsonArray, requireJsonObject, requireString } from "../helpers/parse"

type RouteMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]
type RouteMessageID = ReturnType<typeof MessageID.ascending>

function routeMessageIDs(body: Awaited<ReturnType<Response["json"]>>): string[] {
  return requireJsonArray(body, "session messages").map((message) =>
    requireString(
      requireJsonObject(requireJsonObject(message, "message").info, "message info").id,
      "message id",
    ),
  )
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

async function seedMessages(directory: string, count: number) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const session = await OpenCodeSession.create({})
      const ids: RouteMessageID[] = []

      for (let index = 0; index < count; index += 1) {
        const messageID = MessageID.ascending()
        ids.push(messageID)

        await OpenCodeSession.updateMessage({
          id: messageID,
          sessionID: SessionID.make(session.id),
          role: "user",
          time: { created: Date.now() + index },
          agent: "buddy",
          model: {
            providerID: ProviderID.openai,
            modelID: ModelID.make("gpt-5.4-mini"),
          },
          tools: {},
        } satisfies RouteMessage["info"])
        await OpenCodeSession.updatePart({
          id: PartID.ascending(),
          sessionID: SessionID.make(session.id),
          messageID,
          type: "text",
          text: `m${index}`,
        })
      }

      return {
        sessionID: session.id,
        ids,
      }
    },
  })
}

async function seedCompletedImagegen(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const session = await OpenCodeSession.create({})
      const sessionID = SessionID.make(session.id)
      const userMessageID = MessageID.ascending()
      const assistantMessageID = MessageID.ascending()

      await OpenCodeSession.updateMessage({
        id: userMessageID,
        sessionID,
        role: "user",
        time: { created: 1 },
        agent: "buddy",
        model: {
          providerID: ProviderID.openai,
          modelID: ModelID.make("gpt-5.4-mini"),
        },
        tools: {},
      } satisfies RouteMessage["info"])
      await OpenCodeSession.updateMessage({
        id: assistantMessageID,
        sessionID,
        role: "assistant",
        time: { created: 2, completed: 3 },
        parentID: userMessageID,
        modelID: ModelID.make("gpt-5.4-mini"),
        providerID: ProviderID.openai,
        mode: "build",
        agent: "buddy",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      } satisfies RouteMessage["info"])
      await OpenCodeSession.updatePart({
        id: PartID.ascending(),
        sessionID,
        messageID: assistantMessageID,
        type: "tool",
        callID: "call_imagegen_cold_history",
        tool: "imagegen",
        state: {
          status: "completed",
          input: { prompt: "A red panda" },
          output: "generated",
          title: "Generated image",
          metadata: {},
          attachments: [],
          time: { start: 2, end: 3 },
        },
      })

      return { sessionID: session.id }
    },
  })
}

describe("Buddy session message route", () => {
  test("returns persisted transcript after instance disposal", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await seedMessages(project.path, 3)
    await OpenCodeInstance.disposeAll()

    const response = await app.request(`/api/session/${seeded.sessionID}/message`, {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    const body = routeMessageIDs(await response.json())
    expect(body).toEqual(seeded.ids)
  })

  test("enriches Buddy tool history before the runtime plugin initializes", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await seedCompletedImagegen(project.path)
    ToolRegistry.unregisterToolPresentations(project.path, ["imagegen"])
    expect(ToolRegistry.getToolPresentationDescriptor("imagegen", project.path)).toBeUndefined()
    await OpenCodeInstance.disposeAll()

    const response = await app.request(`/api/session/${seeded.sessionID}/message`, {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({
              tool: "imagegen",
              metadata: expect.objectContaining({
                buddy: {
                  presentation: expect.objectContaining({
                    archetype: "inline-output",
                    phase: "completed",
                    action: "Generated image",
                    icon: "image",
                    renderer: "image-generation",
                    layoutRole: "media-output",
                  }),
                },
              }),
            }),
          ]),
        }),
      ]),
    )
  })

  test("returns vendor-style cursor headers for paginated transcript reads", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await seedMessages(project.path, 5)
    await OpenCodeInstance.disposeAll()

    const firstPage = await app.request(`/api/session/${seeded.sessionID}/message?limit=2`, {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(firstPage.status).toBe(200)
    const firstBody = routeMessageIDs(await firstPage.json())
    expect(firstBody).toEqual(seeded.ids.slice(-2))
    const cursor = firstPage.headers.get("x-next-cursor")
    expect(cursor).toBeTruthy()
    expect(firstPage.headers.get("link")).toContain('rel="next"')

    const secondPage = await app.request(
      `/api/session/${seeded.sessionID}/message?limit=2&before=${encodeURIComponent(cursor ?? "")}`,
      {
        headers: {
          "x-buddy-directory": project.path,
        },
      },
    )

    expect(secondPage.status).toBe(200)
    const secondBody = routeMessageIDs(await secondPage.json())
    expect(secondBody).toEqual(seeded.ids.slice(-4, -2))
  })

  test("returns not found for paginated transcript reads on missing sessions", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing_message_route/message?limit=2", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Session not found" })
  })
})
