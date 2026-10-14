import type { IncomingMessage, ServerResponse } from "node:http"
import type { PluginOption } from "vite"
import { writeSessionTraceLogFile, type WriteSessionTraceInput } from "./session-trace-saver"

export function createDevTraceVitePlugin(repositoryDirectory: string): PluginOption {
  return {
    name: "buddy-web:dev-trace-saver",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url?.split("?")[0]
        if (
          req.method === "POST" &&
          (url === "/api/dev/session-trace" || url === "/__buddy_devtools/session-trace")
        ) {
          void (async () => {
            try {
              const chunks: Buffer[] = []
              for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
              }
              const rawBody = Buffer.concat(chunks).toString("utf8")
              // SAFETY: The parsed JSON payload conforms to WriteSessionTraceInput from devtools client.
              const body = JSON.parse(rawBody) as WriteSessionTraceInput
              const hostHeader = req.headers.host
              const devServer = body.devServer || (hostHeader ? `http://${hostHeader}` : undefined)
              const result = writeSessionTraceLogFile({
                ...body,
                devServer,
                repositoryDirectory,
              })

              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify(result))
            } catch (error) {
              res.statusCode = 500
              res.setHeader("Content-Type", "application/json")
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                }),
              )
            }
          })()
          return
        }
        next()
      })
    },
  }
}
