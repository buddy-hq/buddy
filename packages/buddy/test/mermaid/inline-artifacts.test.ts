import { afterEach, describe, expect, test } from "bun:test"
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
    fn: async () => {
      const session = await OpenCodeSession.create({})
      return session.id
    },
  })
}

describe("inline mermaid artifacts", () => {
  test("creates deterministic v2 artifacts for assistant markdown mermaid blocks", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)

    const requestBody = {
      sessionID,
      messageID: "msg_markdown",
      partID: "part_text",
      segmentIndex: 2,
      source: "graph TD\nA-->B",
    }

    const firstResponse = await app.request(
      `/api/mermaid-artifacts/inline?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify(requestBody),
      },
    )

    expect(firstResponse.status).toBe(200)
    const firstBody = (await firstResponse.json()) as {
      artifactID: string
      kind: string
      origin: {
        kind: string
        sessionID: string
        messageID: string
        partID: string
        segmentIndex: number
      }
      source: string
      alt: string
    }
    expect(firstBody.kind).toBe("mermaid.v2")
    expect(firstBody.origin).toEqual({
      kind: "markdown",
      sessionID,
      messageID: "msg_markdown",
      partID: "part_text",
      segmentIndex: 2,
    })
    expect(firstBody.alt).toBe("Mermaid diagram")
    expect(firstBody.source).toBe("graph TD\nA-->B")

    const secondResponse = await app.request(
      `/api/mermaid-artifacts/inline?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify(requestBody),
      },
    )

    expect(secondResponse.status).toBe(200)
    const secondBody = (await secondResponse.json()) as { artifactID: string }
    expect(secondBody.artifactID).toBe(firstBody.artifactID)
  })
})
