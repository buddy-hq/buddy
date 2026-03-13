import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"

describe("teaching routes", () => {
  test("returns 400 for invalid project config when starting a workspace", async () => {
    const repo = createGitRepo("buddy-route-teaching-invalid-config")
    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          personas: {
            "code-buddy": {
              surfaces: ["curriculum"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const response = await app.request("/api/teaching/session/session_1/workspace", {
      method: "POST",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        persona: "code-buddy",
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })
})
