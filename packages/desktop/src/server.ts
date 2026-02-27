import type { ServerConnection } from "@buddy/web/context/server"

export type DesktopServerReadyData = {
  url: string
  username: string | null
  password: string | null
  isSidecar: boolean
}

export function createDesktopServerConnection(
  ready?: DesktopServerReadyData,
): ServerConnection {
  return {
    url: ready?.url ?? import.meta.env.VITE_BUDDY_SERVER_URL ?? "http://localhost:3000",
    username: ready?.username ?? null,
    password: ready?.password ?? null,
    isSidecar: ready?.isSidecar ?? false,
  }
}
