import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
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

describe("config pollution regression", () => {
  test("must NOT create config.json in project root when patching config", async () => {
    const repo = createGitRepo("buddy-config-pollution-test")

    const configJsonPath = path.join(repo, "config.json")
    const opencodeConfigPath = path.join(repo, "opencode.jsonc")

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_agent: "build",
        compaction: {
          auto: false,
        },
      }),
    })

    expect(patchResponse.status).toBe(200)

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)

    fs.rmSync(repo, { recursive: true, force: true })
  })

  test("must NOT create config.json during prompt flow", async () => {
    const repo = createGitRepo("buddy-prompt-config-pollution-test")

    const configJsonPath = path.join(repo, "config.json")

    expect(fs.existsSync(configJsonPath)).toBe(false)

    await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: {
          id: "anthropic",
        },
      }),
    })

    expect(fs.existsSync(configJsonPath)).toBe(false)

    fs.rmSync(repo, { recursive: true, force: true })
  })
})
