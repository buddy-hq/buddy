import { Buffer } from "node:buffer"
import { serve, type CommandChild } from "./cli"
import {
  API_HEALTH_PATH,
  DEFAULT_SERVER_URL_KEY,
  SIDECAR_HEALTH_TIMEOUT_MS,
  SIDECAR_USERNAME,
  WSL_ENABLED_KEY,
} from "./constants"
import { store } from "./store"

export type WslConfig = {
  enabled: boolean
}

export type HealthCheck = {
  wait: Promise<void>
}

export function getDefaultServerUrl(): string | null {
  const value = store.get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    store.set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  store.delete(DEFAULT_SERVER_URL_KEY)
}

export function getWslConfig(): WslConfig {
  const value = store.get(WSL_ENABLED_KEY)
  return { enabled: typeof value === "boolean" ? value : false }
}

export function setWslConfig(config: WslConfig) {
  store.set(WSL_ENABLED_KEY, config.enabled)
}

export function spawnLocalServer(hostname: string, port: number, password: string) {
  const { child, events, exit } = serve(hostname, port, password)

  const wait = (async () => {
    const targetUrl = `http://${hostname}:${port}`

    const ready = async () => {
      while (true) {
        await delay(100)
        const healthy = await checkHealth(targetUrl, SIDECAR_USERNAME, password)
        if (healthy) {
          return
        }
      }
    }

    const terminated = async () => {
      const result = await exit
      throw new Error(
        `Sidecar terminated before health check passed (code=${result.code ?? "unknown"} signal=${result.signal ?? "unknown"})`,
      )
    }

    await Promise.race([
      ready(),
      terminated(),
      delay(SIDECAR_HEALTH_TIMEOUT_MS).then(() => {
        throw new Error("Sidecar health check timed out")
      }),
    ])
  })()

  return {
    child,
    events,
    health: { wait } satisfies HealthCheck,
  }
}

export async function checkHealth(url: string, username: string, password: string) {
  let targetUrl: URL
  try {
    targetUrl = new URL(API_HEALTH_PATH, url)
  } catch {
    return false
  }

  const headerValue = Buffer.from(`${username}:${password}`).toString("base64")

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        authorization: `Basic ${headerValue}`,
      },
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export { CommandChild }
