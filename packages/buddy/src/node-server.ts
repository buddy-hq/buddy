import { serve } from "@hono/node-server"
import { app } from "./app"
import { startLegacyQuoteTitleRepair } from "./notes/quote-title-repair"
import { startSessionNoteTitleSync } from "./notes/session-title-sync"
import { shutdownAgentRuntime } from "./runtime/agent-runtime"

const AGENT_RUNTIME_CLOSE_TIMEOUT_MS = 4_000

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

  const stopTitleSync = startSessionNoteTitleSync()
  startLegacyQuoteTitleRepair()
  let stopping: Promise<void> | undefined
  return {
    stop: (close = false) => {
      stopping ??= (async () => {
        stopTitleSync()
        const httpClosed = new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
          if (close) closeAllConnections(server)
        })
        const results = await Promise.allSettled([httpClosed, closeRuntimeBeforeShutdown()])
        for (const result of results) {
          if (result.status === "rejected") throw result.reason
        }
      })()
      return stopping
    },
  }
}

async function closeRuntimeBeforeShutdown(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      shutdownAgentRuntime(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          console.warn("Timed out closing the Buddy agent runtime before shutdown")
          resolve()
        }, AGENT_RUNTIME_CLOSE_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timeout)
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

type TBoundProcedure = () => void

function isBoundProcedure<TValue>(value: TValue): value is TValue & TBoundProcedure {
  return isFunctionValue(value)
}

function parseCloseableConnections<TValue>(value: TValue): TCloseableConnections | undefined {
  if (!isObjectValue(value) || !("closeAllConnections" in value)) return undefined
  const method = value.closeAllConnections
  if (!isBoundProcedure(method)) return undefined
  return {
    closeAllConnections: () => {
      method.call(value)
    },
  }
}

function closeAllConnections<TServer>(server: TServer) {
  parseCloseableConnections(server)?.closeAllConnections()
}
