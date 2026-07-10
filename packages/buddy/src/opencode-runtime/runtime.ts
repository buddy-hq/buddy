import fs from "node:fs/promises"
import { BUDDY_TMP_DIR, configureOpenCodeEnvironment } from "./env"
import { XDG_ENV } from "../storage/constants"
import {
  ensurePluginServicePatched,
  registerRuntimePluginFactory,
} from "@buddy/opencode-adapter/plugin-live"
import { ensureConfigServicePatched } from "@buddy/opencode-adapter/config"
import { ensureMcpOAuthBrandingPatched } from "@buddy/opencode-adapter/mcp-oauth-branding"
import { ensureSessionServicePatched } from "@buddy/opencode-adapter/session-live"
import { ensureToolInputDeltaBridgePatched } from "@buddy/opencode-adapter/tool-input-delta-live"
import { Server } from "@buddy/opencode-adapter/server"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { ensureSubagentForwardingPatched } from "./subagent-forwarding"
import { ensureSkillServicePatched } from "./skill-filtering"
import { createBuddyRuntimeHooks } from "./plugins/buddy-runtime-plugin"

let appPromise: Promise<{ fetch(request: Request): Response | Promise<Response> }> | undefined
let buddyRuntimePluginRegistered = false

configureOpenCodeEnvironment()

export async function ensureRuntimeDirectories() {
  const directories = [
    process.env[XDG_ENV.DATA_HOME],
    process.env[XDG_ENV.CACHE_HOME],
    process.env[XDG_ENV.CONFIG_HOME],
    process.env[XDG_ENV.STATE_HOME],
    BUDDY_TMP_DIR,
  ].filter(
    (directory): directory is string => typeof directory === "string" && directory.length > 0,
  )

  await Promise.all(directories.map((directory) => fs.mkdir(directory, { recursive: true })))
}

export async function loadOpenCodeApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await ensureRuntimeDirectories()
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
      await ensureConfigServicePatched()
      await ensureSessionServicePatched()
      await ensurePluginServicePatched()
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
