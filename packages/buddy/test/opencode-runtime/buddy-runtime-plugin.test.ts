import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Config } from "@buddy/backend/config"
import { buildOpenCodeConfigOverlay } from "../../src/config/opencode/overlay-builder"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { createBuddyRuntimeHooks } from "../../src/opencode-runtime/plugins/buddy-runtime-plugin"
import { TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("Buddy runtime plugin", () => {
  test("config overlay no longer injects Buddy as an external file plugin", async () => {
    await using project = await tmpdir({ git: true })

    const config = await Config.getProject(project.path)
    const overlay = await buildOpenCodeConfigOverlay({
      config,
      directory: project.path,
    })

    expect("plugin" in overlay).toBe(false)
  })

  test("Buddy tools appear in OpenCode tool registry after config sync", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const toolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })

    expect(toolIDs).toContain("save_flashcard_deck")
    expect(toolIDs).toContain("ingest_full_text")
    expect(toolIDs).toContain("prepare_resource")
    expect(toolIDs).toContain("render_mermaid")
    expect(toolIDs).toContain("render_figure")
    expect(toolIDs).toContain("learning_tool_search")
  }, 30_000)

  test("Buddy tools load through the plugin path without registerBuddyTools", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()

    const config = await Config.getProject(project.path)
    const overlay = await buildOpenCodeConfigOverlay({
      config,
      directory: project.path,
    })
    setConfigOverlay(project.path, overlay)

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => OpenCodeInstance.dispose(),
    })

    const toolIDs = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.ids(),
    })

    expect(toolIDs).toContain("prepare_resource")
    expect(toolIDs).toContain("ingest_full_text")
  }, 30_000)

  test("Buddy tools can be resolved from the registry after plugin registration", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const tools = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () => ToolRegistry.tools(TEST_TOOL_MODEL),
    })

    const ingestTool = tools.find((tool) => tool.id === "prepare_resource")
    expect(ingestTool).toBeDefined()
  }, 30_000)

  test("system prompt filtering preserves configured external AGENTS files", async () => {
    await using project = await tmpdir({ git: true })

    const hooks = await createBuddyRuntimeHooks({
      directory: project.path,
      worktree: project.path,
    })
    const transform = hooks["experimental.chat.system.transform"]
    expect(transform).toBeDefined()

    const externalAgentsPath = path.resolve(project.path, "..", "shared", "AGENTS.md")
    const externalClaudePath = path.resolve(project.path, "..", "shared", "CLAUDE.md")
    const output = {
      system: [
        [
          `Instructions from: ${externalAgentsPath}`,
          "Keep this external AGENTS block.",
          "",
          `Instructions from: ${externalClaudePath}`,
          "Drop this CLAUDE block.",
        ].join("\n"),
      ],
    }

    await transform?.({}, output)

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain(externalAgentsPath)
    expect(output.system[0]).toContain("Keep this external AGENTS block.")
    expect(output.system[0]).not.toContain(externalClaudePath)
    expect(output.system[0]).not.toContain("Drop this CLAUDE block.")
  }, 30_000)

  test("config overlay build and runtime hook creation can run concurrently", async () => {
    await using project = await tmpdir({ git: true })

    const config = await Config.getProject(project.path)
    await Promise.all(
      Array.from({ length: 10 }, async () =>
        Promise.all([
          buildOpenCodeConfigOverlay({
            config,
            directory: project.path,
          }),
          createBuddyRuntimeHooks({
            directory: project.path,
            worktree: project.path,
          }),
        ]),
      ),
    )
  }, 30_000)

  test("runtime hooks override the OpenAI auth flow with Buddy branding", async () => {
    await using project = await tmpdir({ git: true })

    const hooks = await createBuddyRuntimeHooks({
      directory: project.path,
      worktree: project.path,
    })

    expect(hooks.auth?.provider).toBe("openai")
    expect(hooks.auth?.methods.map((method) => method.label)).toEqual([
      "ChatGPT Pro/Plus (browser)",
      "ChatGPT Pro/Plus (headless)",
      "Manually enter API Key",
    ])
  })
})
