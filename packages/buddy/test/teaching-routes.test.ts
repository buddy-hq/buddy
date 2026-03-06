import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { app } from "../src/index.ts"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

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
