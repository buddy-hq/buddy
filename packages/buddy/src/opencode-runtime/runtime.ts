import fs from "node:fs/promises"
import { Schema } from "effect"
import { BUDDY_TMP_DIR, configureOpenCodeEnvironment } from "./env"
import { XDG_ENV } from "../storage/constants"
import {
  ensurePluginServicePatched,
  registerRuntimePluginFactory,
} from "@buddy/opencode-adapter/plugin-live"
import { ensureConfigServicePatched } from "@buddy/opencode-adapter/config"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import {
  ensureProviderServicePatched,
  registerProviderResolver,
} from "@buddy/opencode-adapter/provider-live"
import { ensureMcpOAuthBrandingPatched } from "@buddy/opencode-adapter/mcp-oauth-branding"
import { ensureSessionServicePatched } from "@buddy/opencode-adapter/session-live"
import { ensureToolInputDeltaBridgePatched } from "@buddy/opencode-adapter/tool-input-delta-live"
import { Server } from "@buddy/opencode-adapter/server"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { ensureSubagentForwardingPatched } from "./subagent-forwarding"
import { ensureSkillServicePatched } from "./skill-filtering"
import { createBuddyRuntimeHooks } from "./plugins/buddy-runtime-plugin"
import {
  applyOpenAICodexAccountModels,
  resolveOpenAICodexAccountModels,
} from "./plugins/openai-codex-provider"
import { OPENAI_PROVIDER_ID } from "./plugins/openai-codex-credentials"
import { initializeBenchCaptureStorage } from "../learning/features/bench/captures"

let appPromise: Promise<{ fetch(request: Request): Response | Promise<Response> }> | undefined
let buddyRuntimePluginRegistered = false
let openAIProviderResolverRegistered = false

configureOpenCodeEnvironment()

export async function ensureRuntimeDirectories() {
  const directories = [
    process.env[XDG_ENV.DATA_HOME],
    process.env[XDG_ENV.CACHE_HOME],
    process.env[XDG_ENV.CONFIG_HOME],
    process.env[XDG_ENV.STATE_HOME],
    BUDDY_TMP_DIR,
  ].filter((directory): directory is string => directory !== undefined && directory.length > 0)

  await Promise.all(directories.map((directory) => fs.mkdir(directory, { recursive: true })))
}

export async function loadOpenCodeApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await ensureRuntimeDirectories()
      await initializeBenchCaptureStorage()
      try {
        const repairedMigrations = await repairLegacyOpenCodeMigrations()
        if (repairedMigrations.length > 0) {
          console.warn("Repaired legacy OpenCode migration journal entries:", repairedMigrations)
        }
      } catch (error) {
        console.warn("Skipping legacy OpenCode migration repair:", error)
      }
      ensureMcpOAuthBrandingPatched()
      if (!buddyRuntimePluginRegistered) {
        registerRuntimePluginFactory(({ directory, worktree }) =>
          createBuddyRuntimeHooks({
            directory,
            worktree,
          }),
        )
        buddyRuntimePluginRegistered = true
      }
      if (!openAIProviderResolverRegistered) {
        registerProviderResolver(OPENAI_PROVIDER_ID, async ({ directory, provider }) => {
          const accountModels = await resolveOpenAICodexAccountModels({ directory })
          if (!accountModels) return undefined
          const parsed = Schema.decodeUnknownSync(OpenCodeProvider.Info)({
            ...provider,
            models: applyOpenAICodexAccountModels(provider.models, accountModels),
          })
          // SAFETY: The runtime provider schema parsed this complete provider; its readonly
          // TypeScript projection does not reflect the mutable OpenCode service interface.
          return parsed as OpenCodeProvider.Info
        })
        openAIProviderResolverRegistered = true
      }
      await ensureConfigServicePatched()
      await ensureSessionServicePatched()
      await ensurePluginServicePatched()
      await ensureProviderServicePatched()
      await ensureToolInputDeltaBridgePatched()
      await ensureSubagentForwardingPatched()
      await ensureSkillServicePatched()
      const built = await Server.Default()
      return {
        fetch(request: Request) {
          return built.app.fetch(request)
        },
      }
    })()
  }

  return appPromise
}
