import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

async function createSession(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeSession.create({}),
  })
}

async function seedMultiPartMessage(input: { directory: string; sessionID: string }) {
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const messageID = MessageID.ascending()
      const firstPartID = PartID.ascending()
      const secondPartID = PartID.ascending()

      await OpenCodeSession.updateMessage({
        id: messageID,
        sessionID: SessionID.make(input.sessionID),
        role: "user",
        time: { created: Date.now() },
        agent: "buddy",
        model: {
          providerID: ProviderID.openai,
          modelID: ModelID.make("gpt-5.4-mini"),
        },
        tools: {},
      })
      await OpenCodeSession.updatePart({
        id: firstPartID,
        sessionID: SessionID.make(input.sessionID),
        messageID,
        type: "text",
        text: "first",
      })
      await OpenCodeSession.updatePart({
        id: secondPartID,
        sessionID: SessionID.make(input.sessionID),
        messageID,
        type: "text",
        text: "second",
      })

      return { messageID, secondPartID }
    },
  })
}

describe("Buddy session API parity", () => {
  test("revert route preserves partID when reverting a specific part", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)
    const seeded = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })

    const response = await app.request(`/api/session/${session.id}/revert`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messageID: seeded.messageID,
        partID: seeded.secondPartID,
      }),
    })

    expect(response.status).toBe(200)

    const body = (await response.json()) as { revert?: { messageID: string; partID?: string } }
    expect(body.revert?.messageID).toBe(seeded.messageID)
    expect(body.revert?.partID).toBe(seeded.secondPartID)
  })
})
