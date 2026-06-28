import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { MessageV2 as OpenCodeMessage } from "@buddy/opencode-adapter/message"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

type RouteMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]
type RouteMessageID = ReturnType<typeof MessageID.ascending>

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
    const body = (await response.json()) as OpenCodeMessage.WithParts[]
    expect(body.map((message) => message.info.id)).toEqual(seeded.ids)
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
    const firstBody = (await firstPage.json()) as OpenCodeMessage.WithParts[]
    expect(firstBody.map((message) => message.info.id)).toEqual(seeded.ids.slice(-2))
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
    const secondBody = (await secondPage.json()) as OpenCodeMessage.WithParts[]
    expect(secondBody.map((message) => message.info.id)).toEqual(seeded.ids.slice(-4, -2))
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
