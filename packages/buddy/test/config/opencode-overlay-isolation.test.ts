import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS } from "@buddy/opencode-adapter/config-overlay"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import type { RuntimeHooks } from "@buddy/opencode-adapter/plugin-live"
import {
  ensurePluginServicePatched,
  registerRuntimePluginFactory,
} from "@buddy/opencode-adapter/plugin-live"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { Config } from "@buddy/backend/config"
import { buildOpenCodeConfigOverlay } from "../../src/index"
import { writeProjectConfig } from "../helpers/project-config"
import { tmpdir } from "../helpers/tmpdir"

const OVERLAY_PERMISSION = "buddy_overlay_test_permission"

async function disposeDirectory(directory: string): Promise<void> {
  await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.dispose(),
  })
}

async function applyProjectOverlay(directory: string): Promise<void> {
  const config = await Config.getProject(directory)
  const overlay = await buildOpenCodeConfigOverlay({
    config,
    directory,
  })

  setConfigOverlay(directory, overlay, {
    authoritativeKeys: [RUNTIME_CONFIG_OVERLAY_AUTHORITATIVE_KEYS.mcp],
  })
  await disposeDirectory(directory)
}

async function readRuntimeAgentState(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    async fn() {
      const buddyAgent = await OpenCodeAgent.get("buddy")
      return {
        defaultAgent: await OpenCodeAgent.defaultAgent(),
        buddyAgent,
        curriculumOrchestrator: await OpenCodeAgent.get("curriculum-orchestrator"),
        overlayPermissionAction: PermissionNext.evaluate(
          OVERLAY_PERMISSION,
          "*",
          buddyAgent.permission,
        ).action,
      }
    },
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("opencode config overlay isolation", () => {
  test("keeps primary-agent and subagent overlays scoped to the active directory across resets", async () => {
    await using firstProject = await tmpdir({ git: true })
    await using secondProject = await tmpdir({ git: true })

    writeProjectConfig(
      firstProject.path,
      JSON.stringify(
        {
          default_persona: "teaching-buddy",
          permission: {
            [OVERLAY_PERMISSION]: "allow",
          },
          agent: {
            "curriculum-orchestrator": {
              description: "first project curriculum",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )
    writeProjectConfig(
      secondProject.path,
      JSON.stringify(
        {
          default_persona: "buddy",
          permission: {
            [OVERLAY_PERMISSION]: "deny",
          },
          agent: {
            "curriculum-orchestrator": {
              description: "second project curriculum",
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    try {
      await applyProjectOverlay(firstProject.path)
      await applyProjectOverlay(secondProject.path)

      const firstInitial = await readRuntimeAgentState(firstProject.path)
      const secondInitial = await readRuntimeAgentState(secondProject.path)

      expect(firstInitial.defaultAgent).toBe("teaching-buddy")
      expect(firstInitial.curriculumOrchestrator?.description).toBe("first project curriculum")
      expect(firstInitial.overlayPermissionAction).toBe("allow")

      expect(secondInitial.defaultAgent).toBe("buddy")
      expect(secondInitial.curriculumOrchestrator?.description).toBe("second project curriculum")
      expect(secondInitial.overlayPermissionAction).toBe("deny")

      await disposeDirectory(firstProject.path)
      await disposeDirectory(secondProject.path)

      const firstAfterReset = await readRuntimeAgentState(firstProject.path)
      const secondAfterReset = await readRuntimeAgentState(secondProject.path)

      expect(firstAfterReset.defaultAgent).toBe("teaching-buddy")
      expect(firstAfterReset.curriculumOrchestrator?.description).toBe("first project curriculum")
      expect(firstAfterReset.overlayPermissionAction).toBe("allow")

      expect(secondAfterReset.defaultAgent).toBe("buddy")
      expect(secondAfterReset.curriculumOrchestrator?.description).toBe("second project curriculum")
      expect(secondAfterReset.overlayPermissionAction).toBe("deny")
    } finally {
      clearConfigOverlay(firstProject.path)
      clearConfigOverlay(secondProject.path)
    }
  }, 15_000)

  test("canonicalizes directory aliases when resolving runtime overlays", async () => {
    await using project = await tmpdir({ git: true })

    const aliasDirectory = path.join(project.path, ".")
    const commandName = "buddy_alias_runtime_command"

    try {
      setConfigOverlay(aliasDirectory, {
        command: {
          [commandName]: {
            template: "echo alias",
            description: "Alias-scoped command",
          },
        },
      })

      await disposeDirectory(project.path)

      const runtimeConfig = await OpenCodeInstance.provide({
        directory: project.path,
        fn: () => OpenCodeConfig.get(),
      })

      expect(runtimeConfig.command?.[commandName]?.template).toBe("echo alias")
    } finally {
      clearConfigOverlay(aliasDirectory)
    }
  })

  test("keeps Buddy MCP config authoritative without dropping other raw OpenCode config", async () => {
    await using project = await tmpdir({ git: true })

    const rawMcpName = "raw_opencode_mcp"
    const buddyMcpName = "buddy_managed_mcp"
    const rawCommandName = "raw_opencode_command"

    writeFileSync(
      path.join(project.path, "opencode.jsonc"),
      JSON.stringify(
        {
          command: {
            [rawCommandName]: {
              template: "echo raw",
              description: "Raw OpenCode command",
            },
          },
          mcp: {
            [rawMcpName]: {
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
          mcp: {
            [buddyMcpName]: {
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

    try {
      await applyProjectOverlay(project.path)

      const runtimeConfig = await OpenCodeInstance.provide({
        directory: project.path,
        fn: () => OpenCodeConfig.get(),
      })

      expect(runtimeConfig.command?.[rawCommandName]?.template).toBe("echo raw")
      expect(runtimeConfig.mcp?.[rawMcpName]).toBeUndefined()
      expect(runtimeConfig.mcp?.[buddyMcpName]?.enabled).toBe(false)
    } finally {
      clearConfigOverlay(project.path)
    }
  })

  test("normalizes runtime overlays with OpenCode config substitutions", async () => {
    await using project = await tmpdir({ git: true })

    const envName = "BUDDY_OVERLAY_SUBSTITUTION_TEST"
    const commandName = "buddy_substitution_runtime_command"
    const previous = process.env[envName]

    try {
      process.env[envName] = "echo substituted"
      setConfigOverlay(project.path, {
        command: {
          [commandName]: {
            template: `{env:${envName}}`,
            description: "Substitution-scoped command",
          },
        },
      })

      await disposeDirectory(project.path)

      const runtimeConfig = await OpenCodeInstance.provide({
        directory: project.path,
        fn: () => OpenCodeConfig.get(),
      })

      expect(runtimeConfig.command?.[commandName]?.template).toBe("echo substituted")
    } finally {
      clearConfigOverlay(project.path)
      if (previous === undefined) {
        delete process.env[envName]
      } else {
        process.env[envName] = previous
      }
    }
  })

  test("preserves plugin config hook mutations when an overlay is active", async () => {
    await using project = await tmpdir({ git: true })

    const providerID = "buddy-overlay-plugin-provider"
    const modelID = "chat"
    const envName = "BUDDY_OVERLAY_PLUGIN_PROVIDER_KEY"
    const overlayCommandName = "buddy_plugin_config_hook_runtime_overlay_command"
    const previous = process.env[envName]
    const unregister = registerRuntimePluginFactory(
      async (): Promise<RuntimeHooks> => ({
        async config(cfg) {
          cfg.provider ??= {}
          cfg.provider[providerID] = {
            name: "Buddy Overlay Plugin Provider",
            env: [envName],
            npm: "@ai-sdk/openai-compatible",
            api: "https://example.com/v1",
            models: {
              [modelID]: {
                name: "Buddy Overlay Plugin Chat",
                tool_call: true,
                limit: { context: 128000, output: 4096 },
              },
            },
          }
        },
      }),
    )

    try {
      process.env[envName] = "test-key"
      await ensurePluginServicePatched()
      setConfigOverlay(project.path, {
        command: {
          [overlayCommandName]: {
            template: "echo overlay",
            description: "Overlay active during plugin config hook",
          },
        },
      })

      await disposeDirectory(project.path)

      const providers = await OpenCodeInstance.provide({
        directory: project.path,
        fn: () => OpenCodeProvider.list(),
      })
      const provider = Object.values(providers).find((entry) => entry.id === providerID)

      expect(provider).toBeDefined()
      expect(provider?.models[modelID]?.name).toBe("Buddy Overlay Plugin Chat")
    } finally {
      unregister()
      clearConfigOverlay(project.path)
      if (previous === undefined) {
        delete process.env[envName]
      } else {
        process.env[envName] = previous
      }
    }
  })
})
