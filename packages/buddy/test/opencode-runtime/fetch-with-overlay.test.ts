import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { loadOpenCodeApp } from "../../src/opencode-runtime/runtime"
import { writeProjectConfig } from "../helpers/project-config"
import { tmpdir } from "../helpers/tmpdir"

describe("in-process OpenCode fetch overlay", () => {
  test("loads Buddy runtime config surfaces when SDK requests run through fetchOpenCodeApp", async () => {
    await using project = await tmpdir({ git: true })

    writeFileSync(
      path.join(project.path, "opencode.jsonc"),
      JSON.stringify(
        {
          mcp: {
            raw_opencode_test: {
              type: "local",
              command: ["bun", "--version"],
              enabled: false,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    writeProjectConfig(
      project.path,
      JSON.stringify(
        {
          disabled_providers: ["openai"],
          mcp: {
            local_test: {
              type: "local",
              command: ["bun", "--version"],
              enabled: false,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path, true)

    const client = await getOpenCodeClient(project.path)
    const [agents, commands, configProviders, providerList, mcpStatus] = await Promise.all([
      client.app.agents({
        directory: project.path,
      }),
      client.command.list({
        directory: project.path,
      }),
      client.config.providers({
        directory: project.path,
      }),
      client.provider.list({
        directory: project.path,
      }),
      client.mcp.status({
        directory: project.path,
      }),
    ])

    expect(agents.error).toBeUndefined()
    expect(agents.data?.some((agent) => agent.name === "buddy")).toBe(true)

    expect(commands.error).toBeUndefined()
    expect(commands.data?.some((command) => command.name === "flashcard")).toBe(true)

    expect(configProviders.error).toBeUndefined()
    expect(configProviders.data?.providers.some((provider) => provider.id === "openai")).toBe(false)

    expect(providerList.error).toBeUndefined()
    expect(providerList.data?.all.some((provider) => provider.id === "openai")).toBe(false)

    expect(mcpStatus.error).toBeUndefined()
    expect(mcpStatus.data).toHaveProperty("local_test")
    expect(mcpStatus.data).not.toHaveProperty("raw_opencode_test")
  }, 30_000)
})
