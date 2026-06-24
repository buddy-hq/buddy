import { app, isEntrypoint, startEntrypointServer } from "./node"

if (isEntrypoint(import.meta.url)) {
  startEntrypointServer(process.argv.slice(2))
}

export { app }
export { buildOpenCodeConfigOverlay } from "@buddy/backend/config/runtime"
