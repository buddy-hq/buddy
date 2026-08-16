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

type TCloseableConnections = {
  closeAllConnections: () => void
}

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_STRING_TAG = "[object String]"
const OBJECT_NUMBER_TAG = "[object Number]"
const OBJECT_BOOLEAN_TAG = "[object Boolean]"
const OBJECT_SYMBOL_TAG = "[object Symbol]"
const OBJECT_BIGINT_TAG = "[object BigInt]"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
}

function isFunctionValue<TValue>(value: TValue): boolean {
  const tag = objectTag(value)
  return tag === OBJECT_FUNCTION_TAG || tag === OBJECT_ASYNC_FUNCTION_TAG
}

function isObjectValue<TValue>(value: TValue): value is TValue & object {
  if (value === null || value === undefined) return false
  const tag = objectTag(value)
  return (
    tag !== OBJECT_STRING_TAG &&
    tag !== OBJECT_NUMBER_TAG &&
    tag !== OBJECT_BOOLEAN_TAG &&
    tag !== OBJECT_SYMBOL_TAG &&
    tag !== OBJECT_BIGINT_TAG
  )
}

function parseCloseableConnections<TValue>(value: TValue): TCloseableConnections | undefined {
  if (!isObjectValue(value) || !("closeAllConnections" in value)) return undefined
  if (!isFunctionValue(value.closeAllConnections)) return undefined
  return value
}

function closeAllConnections<TServer>(server: TServer) {
  parseCloseableConnections(server)?.closeAllConnections()
}
