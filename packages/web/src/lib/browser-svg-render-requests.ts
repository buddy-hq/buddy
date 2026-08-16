import type {
  SvgRenderingCompleteBrowserRenderData,
  SvgRenderingCompleteBrowserRenderResponses,
  SvgRenderingListBrowserRenderRequestsResponses,
} from "@buddy/sdk"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const SVG_RENDER_REQUEST_EVENT_TYPE = "svg.render_request"
const SVG_RENDER_COMPLETED_LEDGER_LIMIT = 512
const SVG_RENDER_MAX_ERROR_CHARACTERS = 2_000
const SVG_RENDER_MAX_WARNINGS = 16
const SVG_RENDER_MAX_WARNING_CHARACTERS = 1_000

const BROWSER_SVG_SOURCE_FORMATS = ["smiles", "cxsmiles", "reaction-smiles", "ket"] as const

type BrowserSvgRenderRequest = SvgRenderingListBrowserRenderRequestsResponses[200][number]
type BrowserSvgRenderCompletion = NonNullable<SvgRenderingCompleteBrowserRenderData["body"]>
type BrowserSvgRenderCompletionResponse = SvgRenderingCompleteBrowserRenderResponses[200]
type BrowserSvgSourceFormat = (typeof BROWSER_SVG_SOURCE_FORMATS)[number]

type BrowserSvgRenderRequestDependencies = {
  now(): number
  hashSource(source: string): Promise<string>
  render(input: {
    directory: string
    format: BrowserSvgSourceFormat
    source: string
    signal: AbortSignal
  }): Promise<{ svg: string; warnings: string[] }>
  complete(input: {
    directory: string
    requestID: string
    completion: BrowserSvgRenderCompletion
  }): Promise<BrowserSvgRenderCompletionResponse>
  listPending(directory: string): Promise<BrowserSvgRenderRequest[]>
}

type BrowserSvgRenderExecution = {
  requestKey: string
  operation: Promise<void>
}

type BrowserSvgRenderSynchronization = {
  requested: boolean
}

type BrowserSvgRenderSynchronizationEntry = {
  synchronization: BrowserSvgRenderSynchronization
  operation: Promise<void>
}

function readNonEmptyString<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  return text && text.length > 0 ? text : undefined
}

function readBrowserSvgRenderRequestEvent<TValue>(value: TValue): string | undefined {
  const record = parseTJsonObject(value)
  if (!record || record.type !== SVG_RENDER_REQUEST_EVENT_TYPE) return undefined
  const properties = parseTJsonObject(record.properties)
  if (!properties) return undefined
  return readNonEmptyString(properties.requestID)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hashSource(source: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  return bytesToHex(new Uint8Array(digest))
}

async function renderSvgInBrowser(input: {
  directory: string
  format: BrowserSvgSourceFormat
  source: string
  signal: AbortSignal
}): Promise<{ svg: string; warnings: string[] }> {
  const { renderChemistrySvg } = await import("@/components/media/renderers/chemistry/render")
  const rendered = await renderChemistrySvg(input)
  return {
    svg: rendered.svg,
    warnings: rendered.warnings,
  }
}

async function completeBrowserSvgRender(input: {
  directory: string
  requestID: string
  completion: BrowserSvgRenderCompletion
}): Promise<BrowserSvgRenderCompletionResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).svgRendering.completeBrowserRender({
      requestID: input.requestID,
      body: input.completion,
    }),
  )
}

async function listPendingBrowserSvgRenders(directory: string): Promise<BrowserSvgRenderRequest[]> {
  return requireBuddyData(await getBuddyClient(directory).svgRendering.listBrowserRenderRequests())
}

function errorMessage<TError>(error: TError): string {
  const message = error instanceof Error ? error.message : `${error}`
  const normalized = message.trim() || "Browser SVG rendering failed."
  return normalized.slice(0, SVG_RENDER_MAX_ERROR_CHARACTERS)
}

function normalizeWarnings(warnings: readonly string[]): string[] {
  return warnings
    .map((warning) => warning.trim())
    .filter(Boolean)
    .slice(0, SVG_RENDER_MAX_WARNINGS)
    .map((warning) => warning.slice(0, SVG_RENDER_MAX_WARNING_CHARACTERS))
}

function requestKey(request: BrowserSvgRenderRequest): string {
  return [request.directory, request.format, request.sourceHash, String(request.expiresAt)].join(
    "\0",
  )
}

export class BrowserSvgRenderRequestExecutor {
  readonly #dependencies: BrowserSvgRenderRequestDependencies
  readonly #executions = new Map<string, BrowserSvgRenderExecution>()
  readonly #completed = new Map<string, string>()
  readonly #synchronizations = new Map<string, BrowserSvgRenderSynchronizationEntry>()

  constructor(dependencies: BrowserSvgRenderRequestDependencies) {
    this.#dependencies = dependencies
  }

  async handle(request: BrowserSvgRenderRequest): Promise<void> {
    if (request.expiresAt <= this.#dependencies.now()) return
    const key = requestKey(request)
    const completedKey = this.#completed.get(request.requestID)
    if (completedKey && completedKey !== key) {
      throw new Error(`Conflicting browser SVG render request ${request.requestID}.`)
    }
    if (completedKey) return

    let execution = this.#executions.get(request.requestID)
    if (execution?.requestKey !== undefined && execution.requestKey !== key) {
      throw new Error(`Conflicting browser SVG render request ${request.requestID}.`)
    }
    if (!execution) {
      const operation = this.#execute(request)
      execution = {
        requestKey: key,
        operation,
      }
      this.#executions.set(request.requestID, execution)
      void operation.then(
        () => {
          if (this.#executions.get(request.requestID)?.operation !== operation) return
          this.#executions.delete(request.requestID)
          this.#recordCompleted(request.requestID, key)
        },
        () => {
          if (this.#executions.get(request.requestID)?.operation === operation) {
            this.#executions.delete(request.requestID)
          }
        },
      )
    }

    await execution.operation
  }

  async #execute(request: BrowserSvgRenderRequest): Promise<void> {
    const completion = await this.#render(request)
    const response = await this.#dependencies.complete({
      directory: request.directory,
      requestID: request.requestID,
      completion,
    })
    if (response.status === "conflict") {
      throw new Error(`Browser SVG render request ${request.requestID} conflicted.`)
    }
  }

  synchronize(directory: string): Promise<void> {
    const active = this.#synchronizations.get(directory)
    if (active) {
      active.synchronization.requested = true
      return active.operation
    }

    const synchronization: BrowserSvgRenderSynchronization = {
      requested: false,
    }
    const operation = Promise.resolve().then(() =>
      this.#synchronizeUntilQuiet(directory, synchronization),
    )
    this.#synchronizations.set(directory, { synchronization, operation })
    return operation
  }

  async #synchronizeUntilQuiet(
    directory: string,
    synchronization: BrowserSvgRenderSynchronization,
  ): Promise<void> {
    try {
      do {
        synchronization.requested = false
        await this.#synchronize(directory)
      } while (synchronization.requested)
    } finally {
      if (this.#synchronizations.get(directory)?.synchronization === synchronization) {
        this.#synchronizations.delete(directory)
      }
    }
  }

  async #synchronize(directory: string): Promise<void> {
    const requests = await this.#dependencies.listPending(directory)
    await Promise.all(requests.map((request) => this.handle(request)))
  }

  async #render(request: BrowserSvgRenderRequest): Promise<BrowserSvgRenderCompletion> {
    const sourceHash = await this.#dependencies.hashSource(request.source)
    if (sourceHash !== request.sourceHash) {
      throw new Error(`Browser SVG render request ${request.requestID} failed source verification.`)
    }

    const abortController = new AbortController()
    const timeout = globalThis.setTimeout(
      () => abortController.abort(),
      Math.max(0, request.expiresAt - this.#dependencies.now()),
    )
    try {
      const rendered = await this.#dependencies.render({
        directory: request.directory,
        format: request.format,
        source: request.source,
        signal: abortController.signal,
      })
      return {
        outcome: "rendered",
        sourceHash,
        svg: rendered.svg,
        warnings: normalizeWarnings(rendered.warnings),
      }
    } catch (error) {
      return {
        outcome: "failed",
        sourceHash,
        error: errorMessage(error),
      }
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }

  #recordCompleted(requestID: string, key: string): void {
    this.#completed.delete(requestID)
    this.#completed.set(requestID, key)
    while (this.#completed.size > SVG_RENDER_COMPLETED_LEDGER_LIMIT) {
      const oldestRequestID = this.#completed.keys().next().value
      if (oldestRequestID === undefined) return
      this.#completed.delete(oldestRequestID)
    }
  }
}

const browserSvgRenderRequestExecutor = new BrowserSvgRenderRequestExecutor({
  now: () => Date.now(),
  hashSource,
  render: renderSvgInBrowser,
  complete: completeBrowserSvgRender,
  listPending: listPendingBrowserSvgRenders,
})

function handleBrowserSvgRenderRequest(request: BrowserSvgRenderRequest): Promise<void> {
  return browserSvgRenderRequestExecutor.handle(request)
}

function synchronizeBrowserSvgRenderRequests(directory: string): Promise<void> {
  return browserSvgRenderRequestExecutor.synchronize(directory)
}

export {
  handleBrowserSvgRenderRequest,
  readBrowserSvgRenderRequestEvent,
  synchronizeBrowserSvgRenderRequests,
}
export type {
  BrowserSvgRenderCompletion,
  BrowserSvgRenderRequest,
  BrowserSvgRenderRequestDependencies,
  BrowserSvgSourceFormat,
}
