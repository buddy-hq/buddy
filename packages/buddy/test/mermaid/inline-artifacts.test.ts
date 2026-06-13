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
  async function postInlineMermaidArtifact(input: {
    directory: string
    sessionID: string
    messageID: string
    partID: string
    segmentIndex: number
    source: string
  }): Promise<Response> {
    return app.request(
      `/api/artifacts/mermaid/inline?directory=${encodeURIComponent(input.directory)}`,
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

  test("creates inline artifacts for assistant markdown mermaid blocks", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)

    const requestBody = {
      sessionID,
      messageID: "msg_markdown",
      partID: "part_text",
      segmentIndex: 2,
      source: "graph TD\nA-->B",
    }

    const firstResponse = await postInlineMermaidArtifact({
      directory: project.path,
      ...requestBody,
    })

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

    const secondResponse = await postInlineMermaidArtifact({
      directory: project.path,
      ...requestBody,
    })

    expect(secondResponse.status).toBe(200)
    const secondBody = (await secondResponse.json()) as { artifactID: string }
    expect(secondBody.artifactID).toBe(firstBody.artifactID)

    const indexResponse = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=mermaid`,
    )
    expect(indexResponse.status).toBe(200)
    const index = (await indexResponse.json()) as {
      artifacts: Array<{
        artifactID: string
        kind: string
        origin: {
          kind: string
          sessionID: string
          messageID: string
          partID: string
          segmentIndex: number
        }
      }>
      loadErrors: unknown[]
    }
    expect(index.artifacts).toHaveLength(1)
    expect(index.loadErrors).toEqual([])
    expect(index.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mermaid",
          origin: {
            kind: "markdown",
            sessionID,
            messageID: "msg_markdown",
            partID: "part_text",
            segmentIndex: 2,
          },
        }),
      ]),
    )
  })

  test("deduplicates concurrent inline artifact creation for the same markdown segment", async () => {
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
        postInlineMermaidArtifact({
          directory: project.path,
          ...requestBody,
        }),
      ),
    )
    for (const response of responses) {
      expect(response.status).toBe(200)
    }
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{
      artifactID: string
    }>
    expect(new Set(bodies.map((body) => body.artifactID)).size).toBe(1)

    const indexResponse = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=mermaid`,
    )
    expect(indexResponse.status).toBe(200)
    const index = (await indexResponse.json()) as {
      artifacts: Array<{ artifactID: string }>
      loadErrors: unknown[]
    }
    expect(index.artifacts).toHaveLength(1)
    expect(index.artifacts[0]?.artifactID).toBe(bodies[0]?.artifactID)
    expect(index.loadErrors).toEqual([])
  })
})
