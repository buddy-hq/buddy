import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const runGit = promisify(execFile)
const excludedDirectories = new Set(["node_modules", "__pycache__", ".venv", ".buddy"])

function searchable(filePath: string): boolean {
  return filePath
    .split("/")
    .every((part) => !part.startsWith(".") && !excludedDirectories.has(part))
}

type NotebookFileScanInput = {
  directory: string
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
    controller.abort(new Error("Notebook file scan timed out"))
  }, deadlineMs + NOTEBOOK_FILE_SCAN_CLOSE_GRACE_MS)
  const onAbort = () => controller.abort(input.signal?.reason)
  input.signal?.addEventListener("abort", onAbort, { once: true })
  const scan = scanFiles({
    directory: input.directory,
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

export async function scanNotebookFiles(
  input: NotebookFileScanInput & { signal?: AbortSignal },
): Promise<NotebookFileScan> {
  input.signal?.throwIfAborted()
  await fs.access(input.directory)
  const inRepository = await runGit("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: input.directory,
    signal: input.signal,
    windowsHide: true,
  }).then(
    (result) => result.stdout.trim() === "true",
    () => false,
  )
  input.signal?.throwIfAborted()
  if (!inRepository) return walkNotebookFiles(input)
  const ignored = await runGit(
    "git",
    ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"],
    {
      cwd: input.directory,
      signal: input.signal,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  const ignoredPaths = new Set(ignored.stdout.split("\0"))
  input.signal?.throwIfAborted()
  const scan = await new Promise<NotebookFileScan>((resolve, reject) => {
    const child = spawn("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: input.directory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const paths: string[] = []
    const seen = new Set<string>()
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
        const filePath = pending.subarray(start, end).toString("utf8").replaceAll("\\", "/")
        if (searchable(filePath) && !ignoredPaths.has(filePath) && !seen.has(filePath)) {
          if (paths.length === input.limit) {
            bounded = true
            pending = Buffer.alloc(0)
            child.kill()
            return
          }
          seen.add(filePath)
          paths.push(filePath)
        }
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
      if (timedOut || bounded || code === 0) {
        resolve({ paths, partial: timedOut || bounded })
        return
      }
      reject(new Error(stderr.trim() || `Notebook file scan failed (${code})`))
    })
  })
  const paths: string[] = []
  for (let offset = 0; offset < scan.paths.length; offset += 128) {
    input.signal?.throwIfAborted()
    if (input.deadlineAt !== undefined && Date.now() >= input.deadlineAt)
      return { paths, partial: true }
    const batch = await Promise.all(
      scan.paths.slice(offset, offset + 128).map(async (filePath) => {
        const stats = await fs.stat(path.join(input.directory, filePath)).catch(() => undefined)
        return stats?.isFile() ? filePath : undefined
      }),
    )
    paths.push(...batch.flatMap((filePath) => (filePath === undefined ? [] : [filePath])))
  }
  return { paths, partial: scan.partial }
}

async function walkNotebookFiles(
  input: NotebookFileScanInput & { signal?: AbortSignal },
): Promise<NotebookFileScan> {
  const paths: string[] = []
  const directories = [""]
  const deadlineAt =
    input.deadlineAt ?? Date.now() + (input.deadlineMs ?? NOTEBOOK_FILE_SCAN_DEADLINE_MS)
  while (directories.length > 0) {
    input.signal?.throwIfAborted()
    if (Date.now() >= deadlineAt) return { paths, partial: true }
    const relativeDirectory = directories.pop() ?? ""
    const entries = await fs.readdir(path.join(input.directory, relativeDirectory), {
      withFileTypes: true,
    })
    for (const entry of entries) {
      input.signal?.throwIfAborted()
      const relative = path.posix.join(relativeDirectory, entry.name)
      if (!searchable(relative) || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) directories.push(relative)
      else if (entry.isFile()) {
        if (paths.length === input.limit) return { paths, partial: true }
        paths.push(relative)
      }
    }
  }
  return { paths, partial: false }
}
