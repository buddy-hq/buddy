import fs from "node:fs/promises"
import {
  createOpenCodeHost,
  type OpenCodeHost,
  type OpenCodeLogEntry,
} from "@buddy/opencode-adapter/host"
import { BUDDY_TMP_DIR, configureOpenCodeEnvironment } from "./env"
import { OPENCODE_ENV, XDG_ENV } from "../storage/constants"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { createBuddyOpenCodePlugins, createBuddyOpenCodeInstances } from "./plugins"
import { withBuddyToolPermissionReplies } from "./tool-permission"
import { withBuddyCommandDisplay } from "./command-display"
import { initializeBenchCaptureStorage } from "../learning/features/bench/captures"
import { readOpenCodeHostConfig } from "../config/runtime/notebook-runtime-plan"

const BUDDY_OPENCODE_CLIENT_NAME = "buddy"

let hostPromise: Promise<OpenCodeHost> | undefined
let closingPromise: Promise<void> | undefined

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

function isEnabledFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized === "1" || normalized === "true"
}

function forwardOpenCodeLog(entry: OpenCodeLogEntry) {
  const details = [entry.attributes, entry.cause].filter((value) => value !== undefined)
  if (entry.level === "error" || entry.level === "fatal") {
    console.error("[opencode]", entry.message, ...details)
    return
  }
  console.warn("[opencode]", entry.message, ...details)
}

async function repairLegacyMigrations(databasePath: string) {
  try {
    const repaired = await repairLegacyOpenCodeMigrations(databasePath)
    if (repaired.length > 0) {
      console.warn("Repaired legacy OpenCode migration journal entries:", repaired)
    }
  } catch (error) {
    console.warn("Skipping legacy OpenCode migration repair:", error)
  }
}

async function startOpenCodeHost(): Promise<OpenCodeHost> {
  const paths = configureOpenCodeEnvironment()
  await ensureRuntimeDirectories()
  await initializeBenchCaptureStorage()
  await repairLegacyMigrations(paths.database)
  const host = await createOpenCodeHost({
    clientName: BUDDY_OPENCODE_CLIENT_NAME,
    paths,
    databasePath: paths.database,
    config: await readOpenCodeHostConfig(),
    plugins: createBuddyOpenCodePlugins({ getClient: getOpenCodeHost }),
    instances: createBuddyOpenCodeInstances({ getClient: getOpenCodeHost }),
    log: { level: "warn", emit: forwardOpenCodeLog },
    fetchModels: !isEnabledFlag(process.env[OPENCODE_ENV.DISABLE_MODELS_FETCH]),
  })
  return withBuddyToolPermissionReplies(withBuddyCommandDisplay(host))
}

export function getOpenCodeHost(): Promise<OpenCodeHost> {
  if (closingPromise) return closingPromise.then(getOpenCodeHost)
  hostPromise ??= startOpenCodeHost().catch((cause) => {
    hostPromise = undefined
    throw cause
  })
  return hostPromise
}

export function closeOpenCodeHost(): Promise<void> {
  if (closingPromise) return closingPromise
  const current = hostPromise
  closingPromise = (async () => {
    const host = await current?.catch(() => undefined)
    await host?.close()
  })().finally(() => {
    if (hostPromise === current) hostPromise = undefined
    closingPromise = undefined
  })
  return closingPromise
}
