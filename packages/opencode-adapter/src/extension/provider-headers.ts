import type { SessionModelRequest } from "@opencode/plugin/promise/session"

export function stripOpenCodeHeaders(event: SessionModelRequest): void {
  if (event.model.providerID.startsWith("opencode")) return
  for (const name of Object.keys(event.headers)) {
    if (name.toLowerCase().startsWith("x-opencode-")) delete event.headers[name]
  }
}
