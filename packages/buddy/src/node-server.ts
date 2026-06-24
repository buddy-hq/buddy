import { serve } from "@hono/node-server"
import { app } from "./app"

type NodeServerConfig = {
  hostname: string
  port: number
}

type NodeServerListener = {
  stop: (close?: boolean) => Promise<void>
}

export function listenNodeServer(config: NodeServerConfig): NodeServerListener {
  process.env.PORT = String(config.port)
  console.log(`Server starting on http://${config.hostname}:${config.port}`)
  console.log(`API docs available at http://${config.hostname}:${config.port}/doc`)

  const server = serve({
    fetch: app.fetch,
    hostname: config.hostname,
    port: config.port,
  })

  console.log(`Buddy server listening on http://${config.hostname}:${config.port}`)

  return {
    stop: (close = false) =>
      new Promise<void>((resolve, reject) => {
        if (close) closeAllConnections(server)
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
        if (close) closeAllConnections(server)
      }),
  }
}

function closeAllConnections(server: unknown) {
  if (typeof server !== "object" || server === null) return
  if (!("closeAllConnections" in server)) return

  const close = server.closeAllConnections
  if (typeof close !== "function") return
  close.call(server)
}
