import type { ServerConnection } from "@buddy/web/context/server"
import type { ServerReadyData } from "../preload/types"

const DEFAULT_BUDDY_SERVER_URL = "http://localhost:3000"

export function createDesktopServerConnection(ready?: ServerReadyData): ServerConnection {
  return {
    url: ready?.url ?? import.meta.env.VITE_BUDDY_SERVER_URL ?? DEFAULT_BUDDY_SERVER_URL,
    username: ready?.username ?? null,
    password: ready?.password ?? null,
    isSidecar: ready?.isSidecar ?? false,
  }
}
