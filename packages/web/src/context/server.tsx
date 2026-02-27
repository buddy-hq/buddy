import { createContext, useContext, type ReactNode } from "react"

export type ServerConnection = {
  url: string
  username?: string | null
  password?: string | null
  isSidecar: boolean
}

const defaultServerConnection: ServerConnection = {
  url: "",
  username: null,
  password: null,
  isSidecar: false,
}

let currentServerConnection = defaultServerConnection

function normalizeConnection(value: ServerConnection): ServerConnection {
  return {
    url: value.url.replace(/\/+$/, ""),
    username: value.username ?? null,
    password: value.password ?? null,
    isSidecar: value.isSidecar,
  }
}

const ServerContext = createContext<ServerConnection>(defaultServerConnection)

export function ServerProvider(props: {
  value: ServerConnection
  children: ReactNode
}) {
  const normalized = normalizeConnection(props.value)
  currentServerConnection = normalized

  return (
    <ServerContext.Provider value={normalized}>
      {props.children}
    </ServerContext.Provider>
  )
}

export function useServer() {
  return useContext(ServerContext)
}

export function getServerConnection() {
  return currentServerConnection
}

export function createBrowserServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isSidecar: false,
  }
}
