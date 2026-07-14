import type { IndigoSemanticFormat } from "./validation"
import type {
  IndigoWorkerRenderFailure,
  IndigoWorkerRenderRequest,
  IndigoWorkerRenderResponse,
  IndigoWorkerRenderSuccess,
} from "./worker-protocol"

const INDIGO_WORKER_NAME = "buddy-chemistry-indigo"
const INDIGO_REQUEST_ID_PREFIX = "chemistry"
const INDIGO_RENDER_TIMEOUT_MS = 30_000
const INDIGO_WORKER_IDLE_TIMEOUT_MS = 120_000
const INDIGO_MAX_PENDING_RENDERS = 64
const INDIGO_WORKER_ERROR_CODES = [
  "indigo_render_failed",
  "indigo_runtime_unavailable",
  "invalid_source",
] as const satisfies readonly IndigoWorkerRenderFailure["code"][]

type QueuedRender = {
  source: string
  format: IndigoSemanticFormat
  resolve: (result: IndigoWorkerRenderSuccess) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  abortListener?: () => void
}

type ActiveRender = {
  queued: QueuedRender
  requestID: string
}

function isIndigoWorkerErrorCode(value: unknown): value is IndigoWorkerRenderFailure["code"] {
  return INDIGO_WORKER_ERROR_CODES.some((code) => code === value)
}

type IndigoClientRenderErrorCode =
  | IndigoWorkerRenderFailure["code"]
  | "indigo_render_timeout"
  | "render_cancelled"
  | "renderer_busy"

class IndigoClientRenderError extends Error {
  readonly code: IndigoClientRenderErrorCode

  constructor(code: IndigoClientRenderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "IndigoClientRenderError"
    this.code = code
  }
}

function isWorkerResponse(value: unknown): value is IndigoWorkerRenderResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  if (
    !("requestID" in value) ||
    typeof value.requestID !== "string" ||
    !("type" in value) ||
    (value.type !== "rendered" && value.type !== "error")
  ) {
    return false
  }
  if (value.type === "error") {
    return (
      "message" in value &&
      typeof value.message === "string" &&
      "code" in value &&
      isIndigoWorkerErrorCode(value.code)
    )
  }
  return (
    "rendererVersion" in value &&
    typeof value.rendererVersion === "string" &&
    "svg" in value &&
    typeof value.svg === "string" &&
    "warnings" in value &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  )
}

export class IndigoWorkerClient {
  private worker: Worker | undefined
  private queue: QueuedRender[] = []
  private active: ActiveRender | undefined
  private idleTimeout: ReturnType<typeof setTimeout> | undefined
  private requestCounter = 0

  render(input: {
    source: string
    format: IndigoSemanticFormat
    signal?: AbortSignal
  }): Promise<IndigoWorkerRenderSuccess> {
    if (input.signal?.aborted) {
      return Promise.reject(
        new IndigoClientRenderError(
          "render_cancelled",
          "Indigo chemistry rendering was cancelled.",
        ),
      )
    }
    if (this.queue.length + (this.active ? 1 : 0) >= INDIGO_MAX_PENDING_RENDERS) {
      return Promise.reject(
        new IndigoClientRenderError(
          "renderer_busy",
          "The Indigo chemistry renderer is busy. Try again after pending renders finish.",
        ),
      )
    }
    return new Promise((resolve, reject) => {
      const queued: QueuedRender = {
        source: input.source,
        format: input.format,
        resolve,
        reject,
        timeout: setTimeout(() => this.handleRenderTimeout(queued), INDIGO_RENDER_TIMEOUT_MS),
        ...(input.signal ? { signal: input.signal } : {}),
      }
      this.queue.push(queued)
      if (queued.signal) {
        queued.abortListener = () => this.cancelRender(queued)
        queued.signal.addEventListener("abort", queued.abortListener, { once: true })
        if (queued.signal.aborted) {
          this.cancelRender(queued)
          return
        }
      }
      this.drainQueue()
    })
  }

  destroy(): void {
    this.clearIdleTimeout()
    this.worker?.terminate()
    this.worker = undefined
    const error = new IndigoClientRenderError(
      "render_cancelled",
      "Indigo chemistry renderer was stopped.",
    )
    this.rejectActive(error)
    for (const queued of this.queue.splice(0)) {
      this.rejectQueued(queued, error)
    }
  }

  private createWorker(): Worker {
    if (typeof Worker === "undefined") {
      throw new IndigoClientRenderError(
        "indigo_runtime_unavailable",
        "This environment does not support the Indigo chemistry worker.",
      )
    }
    const worker = new Worker(new URL("./indigo-worker.ts", import.meta.url), {
      name: INDIGO_WORKER_NAME,
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<unknown>) =>
      this.handleMessage(event.data),
    )
    worker.addEventListener("error", (event) => {
      event.preventDefault()
      this.handleWorkerFailure(
        new IndigoClientRenderError(
          "indigo_render_failed",
          event.message || "Indigo chemistry worker failed.",
        ),
      )
    })
    worker.addEventListener("messageerror", () => {
      this.handleWorkerFailure(
        new IndigoClientRenderError(
          "indigo_render_failed",
          "Indigo chemistry worker returned an invalid message.",
        ),
      )
    })
    return worker
  }

  private drainQueue(): void {
    if (this.active || this.queue.length === 0) {
      return
    }
    this.clearIdleTimeout()

    let worker: Worker
    try {
      this.worker ??= this.createWorker()
      worker = this.worker
    } catch (error) {
      const queued = this.queue.shift()
      if (queued) {
        this.rejectQueued(
          queued,
          error instanceof Error
            ? error
            : new IndigoClientRenderError(
                "indigo_runtime_unavailable",
                "Indigo worker failed to start.",
              ),
        )
      }
      this.drainQueue()
      return
    }

    const queued = this.queue.shift()
    if (!queued) {
      this.scheduleIdleTermination()
      return
    }
    this.requestCounter += 1
    const requestID = `${INDIGO_REQUEST_ID_PREFIX}:${this.requestCounter}`
    this.active = {
      queued,
      requestID,
    }
    const request: IndigoWorkerRenderRequest = {
      type: "render",
      requestID,
      source: queued.source,
      format: queued.format,
    }
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no target-origin parameter.
      worker.postMessage(request)
    } catch (error) {
      this.handleWorkerFailure(
        error instanceof Error
          ? error
          : new IndigoClientRenderError(
              "indigo_render_failed",
              "Indigo chemistry worker request failed.",
            ),
      )
    }
  }

  private handleMessage(value: unknown): void {
    if (!isWorkerResponse(value) || value.requestID !== this.active?.requestID) {
      return
    }
    const active = this.active
    this.active = undefined
    this.clearQueuedLifecycle(active.queued)
    if (value.type === "rendered") {
      active.queued.resolve(value)
    } else {
      active.queued.reject(new IndigoClientRenderError(value.code, value.message))
    }
    this.afterRenderSettled()
  }

  private handleWorkerFailure(error: Error): void {
    this.worker?.terminate()
    this.worker = undefined
    this.rejectActive(error)
    this.afterRenderSettled()
  }

  private rejectActive(error: Error): void {
    if (!this.active) {
      return
    }
    const active = this.active
    this.active = undefined
    this.rejectQueued(active.queued, error)
  }

  private cancelRender(queued: QueuedRender): void {
    const error = new IndigoClientRenderError(
      "render_cancelled",
      "Indigo chemistry rendering was cancelled.",
    )
    if (this.active?.queued === queued) {
      this.handleWorkerFailure(error)
      return
    }
    const queueIndex = this.queue.indexOf(queued)
    if (queueIndex < 0) return
    this.queue.splice(queueIndex, 1)
    this.rejectQueued(queued, error)
    if (!this.active && this.queue.length === 0) {
      this.scheduleIdleTermination()
    }
  }

  private handleRenderTimeout(queued: QueuedRender): void {
    const timeoutError = new IndigoClientRenderError(
      "indigo_render_timeout",
      "Indigo chemistry rendering timed out.",
    )
    if (this.active?.queued === queued) {
      this.handleWorkerFailure(timeoutError)
      return
    }
    const queueIndex = this.queue.indexOf(queued)
    if (queueIndex < 0) return
    this.queue.splice(queueIndex, 1)
    this.rejectQueued(queued, timeoutError)
    if (!this.active && this.queue.length === 0) {
      this.scheduleIdleTermination()
    }
  }

  private afterRenderSettled(): void {
    if (this.queue.length > 0) {
      this.drainQueue()
      return
    }
    this.scheduleIdleTermination()
  }

  private scheduleIdleTermination(): void {
    this.clearIdleTimeout()
    this.idleTimeout = setTimeout(() => {
      if (this.active || this.queue.length > 0) {
        return
      }
      this.worker?.terminate()
      this.worker = undefined
      this.idleTimeout = undefined
    }, INDIGO_WORKER_IDLE_TIMEOUT_MS)
  }

  private clearIdleTimeout(): void {
    if (!this.idleTimeout) {
      return
    }
    clearTimeout(this.idleTimeout)
    this.idleTimeout = undefined
  }

  private clearQueuedLifecycle(queued: QueuedRender): void {
    clearTimeout(queued.timeout)
    if (queued.signal && queued.abortListener) {
      queued.signal.removeEventListener("abort", queued.abortListener)
      queued.abortListener = undefined
    }
  }

  private rejectQueued(queued: QueuedRender, error: Error): void {
    this.clearQueuedLifecycle(queued)
    queued.reject(error)
  }
}

export { INDIGO_MAX_PENDING_RENDERS, INDIGO_RENDER_TIMEOUT_MS }
