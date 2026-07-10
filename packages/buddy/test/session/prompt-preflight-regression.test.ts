import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("session prompt preflight regression", () => {
  test("does not misclassify same-project nested sessions as missing on prompt routes", async () => {
    const repo = createGitRepo("buddy-session-preflight-same-project")
    const nested = path.join(repo, "nested")
    mkdirSync(nested, { recursive: true })

    const createResponse = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": repo,
      },
    })
    expect(createResponse.status).toBe(200)
    const created = await readJson(createResponse)
    const sessionID = String(created.id)

    const promptResponse = await app.request(`/api/session/${sessionID}/message`, {
      method: "POST",
      headers: {
        "x-buddy-directory": nested,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: "Teach me closures.",
        persona: "buddy",
        agent: "teaching-buddy",
      }),
    })

    expect(promptResponse.status).toBe(400)
    await expect(promptResponse.json()).resolves.toEqual({
      error: 'Provide either "persona" or "agent", not both',
    })
  })
})
