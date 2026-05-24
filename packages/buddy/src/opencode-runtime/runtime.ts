import fs from "node:fs/promises"
import {
  BUDDY_TMP_DIR,
  BUDDY_XDG_CACHE_HOME,
  BUDDY_XDG_CONFIG_HOME,
  BUDDY_XDG_DATA_HOME,
  BUDDY_XDG_STATE_HOME,
  configureOpenCodeEnvironment,
} from "./env"
import {
  ensurePluginServicePatched,
  registerRuntimePluginFactory,
} from "@buddy/opencode-adapter/plugin-live"
import { Server } from "@buddy/opencode-adapter/server"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { ensureSubagentForwardingPatched } from "./subagent-forwarding"
import { ensureSkillServicePatched } from "./skill-filtering"
import { createBuddyRuntimeHooks } from "./plugins/buddy-runtime-plugin"

let appPromise: Promise<{ fetch(request: Request): Response | Promise<Response> }> | undefined
let buddyRuntimePluginRegistered = false

configureOpenCodeEnvironment()

export async function ensureRuntimeDirectories() {
  await Promise.all([
    fs.mkdir(process.env.XDG_DATA_HOME ?? BUDDY_XDG_DATA_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_CACHE_HOME ?? BUDDY_XDG_CACHE_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_CONFIG_HOME ?? BUDDY_XDG_CONFIG_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_STATE_HOME ?? BUDDY_XDG_STATE_HOME, { recursive: true }),
    fs.mkdir(BUDDY_TMP_DIR, { recursive: true }),
  ])
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
      if (!buddyRuntimePluginRegistered) {
        registerRuntimePluginFactory(({ directory, worktree }) =>
          createBuddyRuntimeHooks({
            directory,
            worktree,
          }),
        )
        buddyRuntimePluginRegistered = true
      }
      await ensurePluginServicePatched()
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
