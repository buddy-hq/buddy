import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"
import { requireJsonObject } from "../helpers/parse"

async function readJson(response: Response) {
  return requireJsonObject(await response.json())
}

describe("session prompt preflight regression", () => {
  test("does not misclassify same-project nested sessions as missing on prompt routes", async () => {
    await using repo = await createGitRepo("buddy-session-preflight-same-project")
    const nested = path.join(repo.path, "nested")
    mkdirSync(nested, { recursive: true })

    const createResponse = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": repo.path,
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
