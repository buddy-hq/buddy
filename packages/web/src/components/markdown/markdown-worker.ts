import { bundledLanguages, normalizeTheme } from "shiki"
import { openCodeTheme } from "./markdown-parser"
import {
  applyMarkdownWorkerResponse,
  shouldReleaseMarkdownWorkerState,
  type MarkdownWorkerRequest,
  type MarkdownWorkerResponse,
  type MarkdownWorkerState,
} from "./markdown-worker-protocol"
import { createWorkerTransport } from "./markdown-worker-transport"

type HighlightRequest = Extract<MarkdownWorkerRequest, { type: "highlight" }>

type PendingHighlight = {
  key: string
  complete: boolean
  resolve: (state: MarkdownWorkerState) => void
  reject: (error: Error) => void
}

const MARKDOWN_WORKER_CACHE_LIMIT = 200

let worker: Worker | undefined
let disabled: Error | undefined
let nextID = 0
const pending = new Map<number, PendingHighlight>()
const states = new Map<string, MarkdownWorkerState>()
const keys = new Set<string>()
const latest = new Map<string, number>()
const transport = createWorkerTransport<HighlightRequest>({
  post: (request) => {
    worker?.postMessage(request)
  },
  supersede: (request) => {
    const result = pending.get(request.id)
    if (!result) return
    pending.delete(request.id)
    result.reject(new MarkdownWorkerSupersededError())
  },
})

export class MarkdownWorkerDisposedError extends Error {}
export class MarkdownWorkerSupersededError extends Error {}
export class MarkdownWorkerUnavailableError extends Error {}

export function highlightStreamingCode(input: {
  key: string
  text: string
  language?: string
  complete?: boolean
}): Promise<MarkdownWorkerState> {
  try {
    getWorker()
  } catch (error) {
    return Promise.reject(error)
  }
  const id = ++nextID
  latest.set(input.key, id)
  keys.delete(input.key)
  keys.add(input.key)
  if (keys.size > MARKDOWN_WORKER_CACHE_LIMIT) {
    const oldest = keys.values().next().value
    if (oldest) disposeMarkdownWorkerKey(oldest)
  }

  return new Promise<MarkdownWorkerState>((resolve, reject) => {
    pending.set(id, { key: input.key, complete: input.complete ?? false, resolve, reject })
    transport.send({
      type: "highlight",
      id,
      key: input.key,
      text: input.text,
      language: input.language && input.language in bundledLanguages ? input.language : "text",
      complete: input.complete,
    })
  })
}

export function resetMarkdownWorkerForTests() {
  pending.forEach((request) => {
    request.reject(new MarkdownWorkerDisposedError())
  })
  pending.clear()
  transport.reset()
  worker?.terminate()
  worker = undefined
  disabled = undefined
  nextID = 0
  states.clear()
  keys.clear()
  latest.clear()
}

export function disposeMarkdownWorkerKey(key: string) {
  keys.delete(key)
  latest.delete(key)
  states.delete(key)
  transport.dispose(key)
  pending.forEach((request, id) => {
    if (request.key !== key) return
    pending.delete(id)
    request.reject(new MarkdownWorkerDisposedError())
  })
  worker?.postMessage({ type: "dispose", key } satisfies MarkdownWorkerRequest)
}

function getWorker() {
  if (worker) return worker
  if (disabled) throw new MarkdownWorkerUnavailableError(disabled.message)
  if (typeof Worker === "undefined") {
    disabled = new Error("Markdown worker is unavailable in this runtime")
    throw new MarkdownWorkerUnavailableError(disabled.message)
  }

  try {
    worker = new Worker(new URL("./markdown-shiki.worker.ts", import.meta.url), {
      type: "module",
    })
  } catch (error) {
    disabled = error instanceof Error ? error : new Error(String(error))
    throw new MarkdownWorkerUnavailableError(disabled.message)
  }

  worker.addEventListener("message", (event: MessageEvent<MarkdownWorkerResponse>) => {
    const result = pending.get(event.data.id)
    if (!result) {
      transport.complete(event.data.key, event.data.id)
      return
    }
    pending.delete(event.data.id)
    if (!keys.has(event.data.key)) {
      result.reject(new MarkdownWorkerDisposedError())
      transport.complete(event.data.key, event.data.id)
      return
    }
    if (event.data.type === "superseded") {
      result.reject(new MarkdownWorkerSupersededError())
      transport.complete(event.data.key, event.data.id)
      return
    }
    if (event.data.type === "error") {
      result.reject(new Error(event.data.message))
      transport.complete(event.data.key, event.data.id)
      return
    }
    const state = applyMarkdownWorkerResponse(states.get(event.data.key), event.data)
    if (
      shouldReleaseMarkdownWorkerState(result.complete, latest.get(event.data.key), event.data.id)
    ) {
      states.delete(event.data.key)
      keys.delete(event.data.key)
      latest.delete(event.data.key)
    } else {
      states.set(event.data.key, state)
    }
    result.resolve(state)
    transport.complete(event.data.key, event.data.id)
  })

  const fail = (message: string) => {
    const error = new Error(message)
    disabled = error
    transport.reset()
    pending.forEach((request) => request.reject(error))
    pending.clear()
    states.clear()
    keys.clear()
    latest.clear()
    worker?.terminate()
    worker = undefined
  }

  worker.addEventListener("error", (event) => fail(event.message || "Markdown worker failed"))
  worker.addEventListener("messageerror", () => fail("Markdown worker response failed"))
  worker.postMessage(
    {
      type: "init",
      theme: normalizeTheme(openCodeTheme),
    } satisfies MarkdownWorkerRequest,
    [],
  )
  return worker
}
