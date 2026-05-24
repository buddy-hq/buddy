import { withConfigOverlay } from "@buddy/opencode-adapter/config"
import { loadOpenCodeApp } from "./runtime"

function decodeDirectoryHeader(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function readOpenCodeRequestDirectory(request: Request): string | undefined {
  const header = request.headers.get("x-opencode-directory")
  if (!header) return undefined
  return decodeDirectoryHeader(header)
}

export async function fetchOpenCodeApp(
  request: Request,
  directory?: string,
): Promise<Response> {
  const app = await loadOpenCodeApp()
  const resolvedDirectory = directory ?? readOpenCodeRequestDirectory(request)

  if (!resolvedDirectory) {
    return app.fetch(request)
  }

  return withConfigOverlay(resolvedDirectory, async () => app.fetch(request))
}
