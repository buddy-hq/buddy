import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"
import { requireJsonObject, requireJsonArray, requireString } from "../helpers/parse"

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

async function postInlineMermaidObject(input: {
  directory: string
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  source: string
}): Promise<Response> {
  return app.request(
    `/api/objects/mermaid/inline?directory=${encodeURIComponent(input.directory)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-buddy-directory": input.directory,
      },
      body: JSON.stringify({
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
        segmentIndex: input.segmentIndex,
        source: input.source,
      }),
    },
  )
}

describe("inline mermaid objects", () => {
  test("creates inline objects for assistant markdown mermaid blocks", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)

    const requestBody = {
      sessionID,
      messageID: "msg_markdown",
      partID: "part_text",
      segmentIndex: 2,
      source: "graph TD\nA-->B",
    }

    const firstResponse = await postInlineMermaidObject({
      directory: project.path,
      ...requestBody,
    })

    expect(firstResponse.status).toBe(200)
    const firstBody = requireJsonObject(await firstResponse.json())
    expect(firstBody.kind).toBe("mermaid")
    expect(firstBody.origin).toEqual({
      kind: "markdown",
      sessionID,
      messageID: "msg_markdown",
      partID: "part_text",
      segmentIndex: 2,
    })
    expect(firstBody.alt).toBe("Mermaid diagram")
    expect(firstBody.source).toBe("graph TD\nA-->B")

    const secondResponse = await postInlineMermaidObject({
      directory: project.path,
      ...requestBody,
    })

    expect(secondResponse.status).toBe(200)
    const secondBody = requireJsonObject(await secondResponse.json())
    expect(secondBody.objectID).toBe(firstBody.objectID)

    const indexResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=mermaid`,
    )
    expect(indexResponse.status).toBe(200)
    const index = requireJsonObject(await indexResponse.json())
    const objects = requireJsonArray(index.objects, "mermaid objects")
    expect(objects).toHaveLength(1)
    expect(index.loadErrors).toEqual([])
    expect(objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectID: firstBody.objectID,
          kind: "mermaid",
        }),
      ]),
    )
  })

  test("deduplicates concurrent inline object creation for the same markdown segment", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)
    const requestBody = {
      sessionID,
      messageID: "msg_concurrent_markdown",
      partID: "part_text",
      segmentIndex: 0,
      source: "flowchart LR\nA[Start] --> B[End]",
    }

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        postInlineMermaidObject({
          directory: project.path,
          ...requestBody,
        }),
      ),
    )
    for (const response of responses) {
      expect(response.status).toBe(200)
    }
    const bodies = await Promise.all(
      responses.map(async (response) => requireJsonObject(await response.json())),
    )
    expect(new Set(bodies.map((body) => requireString(body.objectID, "objectID"))).size).toBe(1)

    const indexResponse = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=mermaid`,
    )
    expect(indexResponse.status).toBe(200)
    const index = requireJsonObject(await indexResponse.json())
    const objects = requireJsonArray(index.objects, "mermaid objects")
    expect(objects).toHaveLength(1)
    expect(requireJsonObject(objects[0], "mermaid object").objectID).toBe(bodies[0]?.objectID)
    expect(index.loadErrors).toEqual([])
  })
})
