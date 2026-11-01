import { app, isEntrypoint, startEntrypointServer, stopEntrypointServer } from "./node"

if (process.argv[2] === "__chemfig-child") {
  await import("./chemistry/chemfig-child")
} else if (import.meta.main || isEntrypoint(import.meta.url)) {
  startEntrypointServer(process.argv.slice(2))
  if (process.env.BUDDY_EXIT_WITH_PARENT === "1") {
    process.stdin.once("end", () => {
      void stopEntrypointServer(0)
    })
    process.stdin.resume()
  }
}

export { app }
export { buildOpenCodeConfigOverlay } from "@buddy/backend/config/runtime"
