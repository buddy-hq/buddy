import { afterEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { UpstreamMessage } from "@buddy/opencode-adapter/gateway/client"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { registerBuddyToolPresentationCatalog, getBuddyToolPresentationDescriptor } from "../../src/opencode-runtime/buddy-tool-presentation-catalog"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"
import { requireJsonArray, requireJsonObject, requireString } from "../helpers/parse"

function routeMessageIDs(body: Awaited<ReturnType<Response["json"]>>): string[] {
  return requireJsonArray(body, "session messages").map((message) =>
    requireString(
      requireJsonObject(requireJsonObject(message, "message").info, "message info").id,
      "message id",
    ),
  )
}

afterEach(async () => {
  await closeOpenCodeHost()
})

async function seedHistory(directory: string, messages: UpstreamMessage[]) {
  const host = await getOpenCodeClient()
  const template = await host.session.create({ location: { directory } })
  const info = { ...template, id: `ses_${randomUUID()}` }
  const session = await host.session.import({ location: { directory }, info, messages })
  await host.session.remove({ sessionID: template.id })
  return session
}

async function seedMessages(directory: string, count: number) {
  const messages: UpstreamMessage[] = Array.from({ length: count }, (_, index) => ({ id: `msg_${randomUUID()}`, type: "user", text: `m${index}`, time: { created: index + 1 } }))
  const session = await seedHistory(directory, messages)
  return { sessionID: session.id, ids: messages.map((message) => message.id) }
}

async function seedCompletedImagegen(directory: string) {
  const session = await seedHistory(directory, [
    { id: "msg_imagegen_user", type: "user", text: "Draw a red panda", time: { created: 1 } },
    { id: "msg_imagegen_assistant", type: "assistant", agent: "buddy", model: { providerID: "openai", id: "gpt-5.4-mini" }, time: { created: 2, completed: 3 }, content: [
      { type: "tool", id: "call_imagegen_cold_history", name: "imagegen", time: { created: 2, ran: 2, completed: 3 }, state: { status: "completed", input: { prompt: "A red panda" }, content: [{ type: "text", text: "generated" }], metadata: {} } },
    ] },
  ])
  return { sessionID: session.id }
}

describe("Buddy session message route", () => {
  test("returns persisted transcript after host restart", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await seedMessages(project.path, 3)
    await closeOpenCodeHost()

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
    registerBuddyToolPresentationCatalog(project.path, [])
    expect(getBuddyToolPresentationDescriptor(project.path, "imagegen")).toBeUndefined()
    await closeOpenCodeHost()

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
    await closeOpenCodeHost()

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

  test("returns a client error for malformed cursors on an existing session", async () => {
    await using project = await tmpdir({ git: true })
    const seeded = await seedMessages(project.path, 1)
    const response = await app.request(`/api/session/${seeded.sessionID}/message?before=malformed-cursor`, { headers: { "x-buddy-directory": project.path } })
    expect(response.status).toBe(400)
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
