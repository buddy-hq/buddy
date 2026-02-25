import fs from "node:fs/promises"
import path from "node:path"
import {
  BUDDY_XDG_CACHE_HOME,
  BUDDY_XDG_CONFIG_HOME,
  BUDDY_XDG_DATA_HOME,
  BUDDY_XDG_STATE_HOME,
  configureOpenCodeEnvironment,
} from "./env.js"

const BUDDY_RUNTIME_ROOT = path.resolve(process.cwd(), ".buddy-runtime")

let appPromise: Promise<{ fetch(request: Request): Promise<Response> }> | undefined

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
      const mod = (await (0, eval)(
        'import("../../../../vendor/opencode-core/src/server/server.ts")',
      )) as {
        Server: {
          App(): { fetch(request: Request): Promise<Response> }
        }
      }
      return mod.Server.App()
    })()
  }

  return appPromise
}

export async function assertOpenCodeRuntime(directory: string) {
  const app = await loadOpenCodeApp()
  const request = new Request("http://buddy/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-opencode-directory": directory,
    },
    body: "{}",
  })
  const response = await app.fetch(request)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenCode startup assertion failed (${response.status}): ${text}`)
  }
}
