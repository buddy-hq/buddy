import { spawn } from "node:child_process"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { RipgrepBinary } from "@opencode-ai/core/ripgrep/binary"
import { makeRuntime } from "opencode/effect/run-service"

const binaryRuntime = makeRuntime(RipgrepBinary.Service, AppNodeBuilder.build(RipgrepBinary.node))

type NotebookFileScanInput = {
  directory: string
  glob: string
  limit: number
  deadlineMs?: number
  deadlineAt?: number
}
type NotebookFileScan = { paths: string[]; partial: boolean }
const NOTEBOOK_FILE_SCAN_DEADLINE_MS = 20_000
const NOTEBOOK_FILE_SCAN_CLOSE_GRACE_MS = 250

function cancellationReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Notebook file search cancelled", "AbortError")
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancellationReason(signal))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort)
      reject(cancellationReason(signal))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (result) => {
        signal.removeEventListener("abort", onAbort)
        resolve(result)
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

/**
 * One fresh walk per request, so a reload never reuses a walk that started before the change
 * it is looking for. Cancelling the request stops the walk; a scanner that stops responding
 * fails at the deadline.
 */
export function scanNotebookFilesWithDeadline(
  input: NotebookFileScanInput & { signal?: AbortSignal },
  scanFiles: (
    input: NotebookFileScanInput & { signal?: AbortSignal },
  ) => Promise<NotebookFileScan> = scanNotebookFiles,
): Promise<NotebookFileScan> {
  if (input.signal?.aborted) return Promise.reject(cancellationReason(input.signal))
  const controller = new AbortController()
  const deadlineMs = input.deadlineMs ?? NOTEBOOK_FILE_SCAN_DEADLINE_MS
  const deadlineAt = Date.now() + deadlineMs
  const deadline = setTimeout(() => {
    // Give the native scanner a brief chance to return paths already emitted after killing rg.
    controller.abort(new Error("Notebook file scan timed out"))
  }, deadlineMs + NOTEBOOK_FILE_SCAN_CLOSE_GRACE_MS)
  const onAbort = () => controller.abort(input.signal?.reason)
  input.signal?.addEventListener("abort", onAbort, { once: true })
  const scan = scanFiles({
    directory: input.directory,
    glob: input.glob,
    limit: input.limit,
    deadlineMs,
    deadlineAt,
    signal: controller.signal,
  })
  return raceWithAbort(scan, controller.signal).finally(() => {
    clearTimeout(deadline)
    input.signal?.removeEventListener("abort", onAbort)
  })
}

/** Bounded file listing that preserves ripgrep's incomplete-scan status. */
export async function scanNotebookFiles(
  input: NotebookFileScanInput & { signal?: AbortSignal },
): Promise<NotebookFileScan> {
  input.signal?.throwIfAborted()
  const binary = await binaryRuntime.runPromise((service) => service.filepath)
  input.signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ["--no-config", "--files", "--null", `--glob=${input.glob}`, "--glob=!**/.git/**", "."],
      { cwd: input.directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    )
    const paths: string[] = []
    let pending = Buffer.alloc(0)
    let stderr = ""
    let bounded = false
    let timedOut = false
    const deadlineAt =
      input.deadlineAt ?? Date.now() + (input.deadlineMs ?? NOTEBOOK_FILE_SCAN_DEADLINE_MS)
    const timeout = setTimeout(
      () => {
        timedOut = true
        child.kill()
      },
      Math.max(0, deadlineAt - Date.now()),
    )
    const onAbort = () => child.kill()
    input.signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      if (bounded) return
      pending = Buffer.concat([pending, chunk])
      let start = 0
      let end = pending.indexOf(0, start)
      while (end >= 0) {
        if (paths.length === input.limit) {
          bounded = true
          pending = Buffer.alloc(0)
          child.kill()
          return
        }
        paths.push(
          pending
            .subarray(start, end)
            .toString("utf8")
            .replace(/^\.[\\/]/u, "")
            .replaceAll("\\", "/"),
        )
        start = end + 1
        end = pending.indexOf(0, start)
      }
      pending = pending.subarray(start)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8_192) stderr += chunk.toString("utf8").slice(0, 8_192 - stderr.length)
    })
    child.on("error", (error) => {
      clearTimeout(timeout)
      input.signal?.removeEventListener("abort", onAbort)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      input.signal?.removeEventListener("abort", onAbort)
      if (input.signal?.aborted) {
        reject(cancellationReason(input.signal))
        return
      }
      if (timedOut || bounded || code === 0 || code === 1 || code === 2) {
        resolve({ paths, partial: timedOut || bounded || code === 2 })
        return
      }
      reject(new Error(stderr.trim() || `Notebook file scan failed (${code})`))
    })
  })
}
