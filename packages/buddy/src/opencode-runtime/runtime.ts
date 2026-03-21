import fs from "node:fs/promises"
import {
  BUDDY_XDG_CACHE_HOME,
  BUDDY_XDG_CONFIG_HOME,
  BUDDY_XDG_DATA_HOME,
  BUDDY_XDG_STATE_HOME,
  configureOpenCodeEnvironment,
} from "./env"
import { Server } from "@buddy/opencode-adapter/server"

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
      return Server.Default()
    })()
  }

  return appPromise
}
