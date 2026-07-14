import { createHash } from "node:crypto"
import { renderChemfig } from "@buddy/backend/chemistry/chemfig-renderer"
import { sanitizeChemistrySvg } from "@buddy/backend/chemistry/svg-sanitize"
import { browserSvgRenderRequests, type BrowserSvgRenderTerminal } from "./browser-render-requests"
import { isBrowserSvgSourceFormat, type SvgSourceFormat } from "./contracts"

type RenderedSvgSource = {
  svg: string
  warnings: string[]
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function browserRenderError(terminal: BrowserSvgRenderTerminal): Error {
  if (terminal.status === "failed") {
    return new Error(`Browser SVG rendering failed: ${terminal.error}`)
  }
  if (terminal.status === "expired") {
    return new Error("Browser SVG rendering timed out before returning a result.")
  }
  return new Error("Browser SVG rendering was cancelled.")
}

async function renderSvgSource(input: {
  directory: string
  format: SvgSourceFormat
  source: string
  signal: AbortSignal
}): Promise<RenderedSvgSource> {
  if (isBrowserSvgSourceFormat(input.format)) {
    const enqueued = browserSvgRenderRequests.enqueue({
      directory: input.directory,
      format: input.format,
      source: input.source,
      sourceHash: sha256Text(input.source),
      signal: input.signal,
    })
    const terminal = await enqueued.completion
    input.signal.throwIfAborted()
    if (terminal.status !== "completed") {
      throw browserRenderError(terminal)
    }
    return {
      svg: sanitizeChemistrySvg(terminal.svg),
      warnings: terminal.warnings,
    }
  }

  const rendered = await renderChemfig({
    directory: input.directory,
    source: input.source,
    signal: input.signal,
  })
  return {
    svg: sanitizeChemistrySvg(rendered.svg),
    warnings: [],
  }
}

export { renderSvgSource, sha256Text }
export type { RenderedSvgSource }
