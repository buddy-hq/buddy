import type { ServerConnection } from "@buddy/web/context/server"
import type { ServerReadyData } from "./bindings"

export function createDesktopServerConnection(
  ready?: ServerReadyData,
): ServerConnection {
  return {
    url: ready?.url ?? import.meta.env.VITE_BUDDY_SERVER_URL ?? "http://localhost:3000",
    username: ready?.username ?? null,
    password: ready?.password ?? null,
    isSidecar: ready?.isSidecar ?? false,
  }
}
