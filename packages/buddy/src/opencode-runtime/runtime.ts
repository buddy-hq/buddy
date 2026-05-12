import fs from "node:fs/promises"
import {
  BUDDY_XDG_CACHE_HOME,
  BUDDY_XDG_CONFIG_HOME,
  BUDDY_XDG_DATA_HOME,
  BUDDY_XDG_STATE_HOME,
  configureOpenCodeEnvironment,
} from "./env"
import { ensureSessionServicePatched } from "@buddy/opencode-adapter/session-live"
import { Server } from "@buddy/opencode-adapter/server"
import { ensureSessionToolUiPatched } from "@buddy/opencode-adapter/session-tool-ui"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { ensureSessionPromptToolForwardingPatched } from "./session-prompt-tool-forwarding"
import { ensureTaskToolForwardingPatched } from "./task-tool-forwarding"

let appPromise: Promise<{ fetch(request: Request): Response | Promise<Response> }> | undefined

configureOpenCodeEnvironment()

export async function ensureRuntimeDirectories() {
  await Promise.all([
    fs.mkdir(process.env.XDG_DATA_HOME ?? BUDDY_XDG_DATA_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_CACHE_HOME ?? BUDDY_XDG_CACHE_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_CONFIG_HOME ?? BUDDY_XDG_CONFIG_HOME, { recursive: true }),
    fs.mkdir(process.env.XDG_STATE_HOME ?? BUDDY_XDG_STATE_HOME, { recursive: true }),
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
      await ensureSessionServicePatched()
      await ensureSessionToolUiPatched()
      await ensureSessionPromptToolForwardingPatched()
      ensureTaskToolForwardingPatched()
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
