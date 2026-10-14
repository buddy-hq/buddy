import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { createNotebookTestHost } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"
import { writeProjectConfig } from "../helpers/project-config"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { buildNotebookRuntimePlan, runtimeConfigFingerprint } from "../../src/config/runtime/notebook-runtime-plan"
import { Config } from "../../src/config/config"
import { skillDocument } from "../../src/learning/skill-management/service/documents"
import { scriptedModelPlugin } from "../opencode-runtime/scripted-model"

const location = (directory: string) => ({ location: { directory } })

describe("notebook runtime configuration", () => {
  test("isolates notebooks and applies/removes contributions without replacing sessions", async () => {
    await using first = await createGitRepo("notebook-first")
    await using second = await createGitRepo("notebook-second")
    writeProjectConfig(first.path, JSON.stringify({ default_persona: "teaching-buddy", agent: { custom: { prompt: "First notebook", name: "My agent", temperature: 0.3 } } }))
    writeProjectConfig(second.path, JSON.stringify({ agent: { buddy: { prompt: "Second notebook" } } }))
    await using runtime = await createNotebookTestHost()
    const host = runtime.host
    const nested = path.join(first.path, "nested")
    await fsp.mkdir(nested)
    await syncNotebookRuntimeConfig(host, first.path)
    await syncNotebookRuntimeConfig(host, nested)
    await syncNotebookRuntimeConfig(host, second.path)
    const firstAgents = (await host.agent.list(location(first.path))).data
    const secondAgents = (await host.agent.list(location(second.path))).data
    expect(firstAgents[0]?.id).toBe("teaching-buddy")
    expect(secondAgents[0]?.id).toBe("buddy")
    expect(firstAgents.find((agent) => agent.id === "custom")).toMatchObject({ name: "My agent", system: "First notebook", request: { body: { temperature: 0.3 } } })
    expect(secondAgents.some((agent) => agent.id === "custom")).toBe(false)
    const session = await host.session.create({ ...location(first.path), agent: "custom" })
    writeProjectConfig(first.path, JSON.stringify({ agent: { buddy: { prompt: "Changed first notebook" } } }))
    await syncNotebookRuntimeConfig(host, first.path)
    expect((await host.session.get({ sessionID: session.id })).agent).toBe("custom")
    expect((await host.agent.list(location(first.path))).data.some((agent) => agent.id === "custom")).toBe(false)
    expect((await host.agent.get({ ...location(second.path), agentID: "buddy" })).data.system).toBe("Second notebook")
    expect((await host.agent.get({ ...location(first.path), agentID: "buddy" })).data.system).toBe("Changed first notebook")
    expect((await host.agent.get({ ...location(nested), agentID: "buddy" })).data.system).toBe("Changed first notebook")
    expect((await host.agent.list(location(nested))).data.some((agent) => agent.id === "custom")).toBe(false)
    writeProjectConfig(first.path, JSON.stringify({ mcp: { invalid: { enabled: true } } }))
    await expect(syncNotebookRuntimeConfig(host, first.path)).rejects.toMatchObject({ data: { path: "mcp.invalid" } })
    expect((await host.agent.get({ ...location(first.path), agentID: "buddy" })).data.system).toBe("Changed first notebook")
  })

  test("wins raw config collisions while retaining unrelated commands and authoritative-empty MCP", async () => {
    await using repo = await createGitRepo("notebook-raw-config")
    const raw = JSON.stringify({ default_agent: "raw", agent: { buddy: { prompt: "Raw Buddy" }, raw: { prompt: "Raw agent" } },
      command: { flashcard: { template: "Raw flashcards" }, raw: { template: "Raw command" } },
      mcp: { raw: { type: "local", command: [process.execPath, "-e", "process.exit(1)"], enabled: false } },
    })
    await fsp.writeFile(path.join(repo.path, "opencode.json"), raw)
    await using runtime = await createNotebookTestHost()
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.agent.list(location(repo.path))).data[0]?.id).toBe("buddy")
    expect((await runtime.host.agent.get({ ...location(repo.path), agentID: "buddy" })).data.system).not.toBe("Raw Buddy")
    expect((await runtime.host.agent.get({ ...location(repo.path), agentID: "raw" })).data.system).toBe("Raw agent")
    expect((await runtime.host.command.list(location(repo.path))).data.map((command) => command.name)).toContain("raw")
    expect((await runtime.host.command.list(location(repo.path))).data.find((command) => command.name === "flashcard")?.description).toBe("Generate flashcards from context in learn mode")
    expect((await runtime.host.mcp.list(location(repo.path))).data).toEqual([])
    expect(await fsp.readFile(path.join(repo.path, "opencode.json"), "utf8")).toBe(raw)
  })

  test("rescans skill contents and removes deleted files during notebook sync", async () => {
    await using repo = await createGitRepo("notebook-skill-refresh")
    const skillRoot = path.join(repo.path, "extra-skills")
    const skillFile = path.join(skillRoot, "test-skill", "SKILL.md")
    await fsp.mkdir(path.dirname(skillFile), { recursive: true })
    await fsp.writeFile(skillFile, skillDocument({ name: "test-skill", description: "A test skill", content: "First content" }))
    writeProjectConfig(repo.path, JSON.stringify({ skills: { paths: [skillRoot] } }))
    await using runtime = await createNotebookTestHost()
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.skill.list(location(repo.path))).data.find((skill) => skill.id === "test-skill")?.content).toBe("First content")
    await fsp.writeFile(skillFile, skillDocument({ name: "test-skill", description: "A test skill", content: "Updated content" }))
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.skill.list(location(repo.path))).data.find((skill) => skill.id === "test-skill")?.content).toBe("Updated content")
    await fsp.rm(skillFile)
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.skill.list(location(repo.path))).data.some((skill) => skill.id === "test-skill")).toBe(false)
  })

  test("preserves provider/model overlays and explicit session models through default changes", async () => {
    await using repo = await createGitRepo("notebook-model")
    writeProjectConfig(repo.path, JSON.stringify({ model: "scripted/chat", small_model: "scripted/title", provider: {
      scripted: { npm: "@ai-sdk/openai-compatible", options: { apiKey: "test-key", baseURL: "https://example.invalid", timeout: 7000 }, models: { chat: { name: "Notebook model", limit: { context: 123456, output: 8192 }, variants: { high: { reasoningEffort: "high" } } } } },
    } }))
    await using runtime = await createNotebookTestHost({ plugins: [scriptedModelPlugin([])] })
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    const model = (await runtime.host.model.list(location(repo.path))).data.find((model) => model.providerID === "scripted" && model.id === "chat")
    expect(model).toMatchObject({ name: "Notebook model", limit: { context: 123456, output: 8192 }, variants: [{ id: "high", settings: { reasoningEffort: "high" } }] })
    expect((await runtime.host.agent.get({ ...location(repo.path), agentID: "title" })).data.model).toMatchObject({ providerID: "scripted", id: "title" })
    const session = await runtime.host.session.create({ ...location(repo.path), model: { providerID: "scripted", id: "chat" } })
    writeProjectConfig(repo.path, JSON.stringify({ model: "scripted/next", small_model: "scripted/title", agent: { title: { model: "scripted/next" } }, provider: { scripted: { npm: "@ai-sdk/openai-compatible", options: { apiKey: "test-key", baseURL: "https://example.invalid" }, models: { next: {} } } } }))
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.session.get({ sessionID: session.id })).model?.id).toBe("chat")
    expect((await runtime.host.agent.get({ ...location(repo.path), agentID: "title" })).data.model?.id).toBe("next")
    writeProjectConfig(repo.path, JSON.stringify({ enabled_providers: [] }))
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.provider.list(location(repo.path))).data).toEqual([])
  })

  test("does not resurrect a provider removed by an independent policy transform", async () => {
    await using repo = await createGitRepo("notebook-provider-policy")
    writeProjectConfig(repo.path, JSON.stringify({ provider: { blocked: { npm: "@ai-sdk/openai-compatible", options: { apiKey: "test-key", baseURL: "https://example.invalid" }, models: { chat: {} } } } }))
    await using runtime = await createNotebookTestHost({ plugins: [Plugin.define({ id: "buddy.test.policy", async setup(ctx) {
      await ctx.provider.transform((editor) => editor.remove("blocked"))
    } })] })
    await syncNotebookRuntimeConfig(runtime.host, repo.path)
    expect((await runtime.host.provider.list(location(repo.path))).data.some((provider) => provider.id === "blocked")).toBe(false)
  })

  test("keeps rule order in fingerprints and diagnoses compaction without rewriting config", async () => {
    await using repo = await createGitRepo("notebook-compaction")
    const config = Config.Info.parse({ compaction: { auto: false, prune: false, tail_turns: 2, preserve_recent_tokens: 1000, reserved: 500 } })
    const plan = await buildNotebookRuntimePlan({ config, directory: repo.path })
    expect(plan.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(["compaction.auto", "compaction.prune", "compaction.tail_turns", "compaction.preserve_recent_tokens", "compaction.reserved"])
    expect(runtimeConfigFingerprint([{ action: "read", resource: "*", effect: "deny" }, { action: "read", resource: "notes/*", effect: "allow" }]))
      .not.toBe(runtimeConfigFingerprint([{ action: "read", resource: "notes/*", effect: "allow" }, { action: "read", resource: "*", effect: "deny" }]))
    await expect(buildNotebookRuntimePlan({ config: Config.Info.parse({ mcp: { incomplete: { enabled: true } } }), directory: repo.path })).rejects.toMatchObject({ data: { path: "mcp.incomplete" } })
    const previous = await Config.getGlobal()
    try {
      await Config.replaceGlobal(Config.Info.parse({ ...previous, compaction: config.compaction }))
      await using runtime = await createNotebookTestHost()
      const entries = await runtime.host.config.get(location(repo.path))
      expect(entries.some((entry) => entry.type === "document" && entry.info.compaction?.auto === false && entry.info.compaction.keep?.tokens === 1000 && entry.info.compaction.buffer === 500)).toBe(true)
    } finally { await Config.replaceGlobal(previous) }
  })

  test("projects persisted MCP settings and retired provider IDs onto public v2 config", async () => {
    await using repo = await createGitRepo("notebook-legacy-config")
    const plan = await buildNotebookRuntimePlan({ directory: repo.path, config: Config.Info.parse({
      model: "google-vertex-anthropic/claude", small_model: "azure-cognitive-services/title",
      enabled_providers: ["google-vertex-anthropic", "azure-cognitive-services"],
      provider: {
        "google-vertex-anthropic": { models: { claude: {} } },
        "azure-cognitive-services": { npm: "@ai-sdk/openai-compatible", models: { title: {} } },
      },
      mcp: { remote: { type: "remote", url: "https://example.invalid/mcp", enabled: false, timeout: 1234,
        oauth: { clientId: "fixture-client", clientSecret: "fixture-secret", callbackPort: 3210 } } },
    }) })
    expect(plan.model).toMatchObject({ providerID: "google-vertex", id: "claude" })
    expect(plan.titleModel).toMatchObject({ providerID: "azure", id: "title" })
    expect(plan.enabledProviders).toEqual(["google-vertex", "azure"])
    expect(plan.providers.find((provider) => provider.id === "google-vertex")?.config.models?.claude?.package).toBe("aisdk:@ai-sdk/google-vertex/anthropic")
    expect(plan.mcp[0]?.config).toMatchObject({ type: "remote", disabled: true,
      timeout: { catalog: 1234, execution: 1234 }, oauth: { client_id: "fixture-client", client_secret: "fixture-secret", callback_port: 3210 },
    })
  })
})
