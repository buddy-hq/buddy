import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { app } from "../../src/index.ts"
import { createGitRepo } from "../helpers/repo"

describe("config pollution regression", () => {
  test("must NOT create config.json in project root when patching config", async () => {
    await using repository = await createGitRepo("buddy-config-pollution-test")

    const configJsonPath = path.join(repository.path, "config.json")
    const opencodeConfigPath = path.join(repository.path, "opencode.jsonc")

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)

    const patchResponse = await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repository.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        default_persona: "teaching-buddy",
        model: "anthropic/k2p5",
      }),
    })

    expect(patchResponse.status).toBe(200)

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)
  })

  test("must NOT create config.json during prompt flow", async () => {
    await using repository = await createGitRepo("buddy-prompt-config-pollution-test")

    const configJsonPath = path.join(repository.path, "config.json")
    const opencodeConfigPath = path.join(repository.path, "opencode.jsonc")

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)

    await app.request("/api/config", {
      method: "PATCH",
      headers: {
        "x-buddy-directory": repository.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: {
          id: "anthropic",
        },
      }),
    })

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)

    const headers = {
      "x-buddy-directory": repository.path,
    }

    const configProvidersResponse = await app.request(
      `/api/config/providers?directory=${encodeURIComponent(repository.path)}`,
      {
        headers,
      },
    )
    expect(configProvidersResponse.status).toBe(200)

    const providerListResponse = await app.request(
      `/api/provider?directory=${encodeURIComponent(repository.path)}`,
      {
        headers,
      },
    )
    expect(providerListResponse.status).toBe(200)

    const commandListResponse = await app.request(
      `/api/command?directory=${encodeURIComponent(repository.path)}`,
      {
        headers,
      },
    )
    expect(commandListResponse.status).toBe(200)

    const mcpStatusResponse = await app.request(
      `/api/mcp?directory=${encodeURIComponent(repository.path)}`,
      {
        headers,
      },
    )
    expect(mcpStatusResponse.status).toBe(200)

    expect(fs.existsSync(configJsonPath)).toBe(false)
    expect(fs.existsSync(opencodeConfigPath)).toBe(false)
  })
})
