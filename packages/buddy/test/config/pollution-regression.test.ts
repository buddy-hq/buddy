import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"

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
        default_persona: "code-buddy",
        model: "anthropic/k2p5",
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
