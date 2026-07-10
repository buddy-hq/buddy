import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { TeachingService } from "../../src/learning/features/lesson-workspace/service/operations"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"

describe("teaching routes", () => {
  test("returns 400 for invalid project config when starting a workspace", async () => {
    const repo = createGitRepo("buddy-route-teaching-invalid-config")
    writeProjectConfig(
      repo,
      JSON.stringify(
        {
          personas: {
            "teaching-buddy": {
              surfaces: ["flashcard"],
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
        persona: "teaching-buddy",
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid config:"),
    })
  })

  test("includes remote file list in workspace save conflicts", async () => {
    const repo = createGitRepo("buddy-route-teaching-conflict-files")
    const sessionID = "session_conflict_files"
    const headers = {
      "x-buddy-directory": repo,
      "content-type": "application/json",
    }

    await TeachingService.ensure(repo, sessionID, "ts")

    const addFileResponse = await app.request(`/api/teaching/session/${sessionID}/file`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        relativePath: "remote.ts",
        content: "remote code",
        activate: true,
      }),
    })
    expect(addFileResponse.status).toBe(200)

    const conflictResponse = await app.request(`/api/teaching/session/${sessionID}/workspace`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        code: "local edit",
        expectedRevision: 0,
      }),
    })

    expect(conflictResponse.status).toBe(409)
    const body = (await conflictResponse.json()) as {
      activeRelativePath?: unknown
      files?: { relativePath?: unknown }[]
    }
    expect(body.activeRelativePath).toBe("remote.ts")
    expect(body.files?.map((file) => file.relativePath)).toContain("remote.ts")
  })
})
