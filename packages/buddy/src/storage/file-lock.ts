import { randomUUID } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { clearInterval, setInterval } from "node:timers"
import { setTimeout as sleep } from "node:timers/promises"

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const DEFAULT_LOCK_STALE_MINUTES = 10
const DEFAULT_LOCK_TIMEOUT_MINUTES = 2
const DEFAULT_LOCK_STALE_MS =
  DEFAULT_LOCK_STALE_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
const DEFAULT_LOCK_TIMEOUT_MS =
  DEFAULT_LOCK_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
const DEFAULT_LOCK_RETRY_MS = MILLISECONDS_PER_SECOND / 10
const LOCK_HEARTBEAT_STALE_DIVISOR = 2
const PROCESS_EXISTS_SIGNAL = 0

type FileLockOptions = {
  staleMs?: number
  timeoutMs?: number
  retryMs?: number
  heartbeatMs?: number
}

type FileLockSettings = {
  staleMs: number
  timeoutMs: number
  retryMs: number
  heartbeatMs: number
}

type FileLockHandle = {
  lockPath: string
  token: string
}

type FileLockPayload = {
  token: string
  pid: number
  createdAt: string
}

function staleCleanupLockPath(lockPath: string): string {
  return `${lockPath}.cleanup`
}

function lockSettings(options: FileLockOptions = {}): FileLockSettings {
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
  const retryMs = options.retryMs ?? DEFAULT_LOCK_RETRY_MS

  return {
    staleMs,
    timeoutMs,
    retryMs,
    heartbeatMs: options.heartbeatMs ?? Math.max(retryMs, staleMs / LOCK_HEARTBEAT_STALE_DIVISOR),
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }

  return typeof error.code === "string" ? error.code : undefined
}

function lockPayload(token: string): string {
  return `${JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() })}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseLockPayload(raw: string): FileLockPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      typeof parsed.token !== "string" ||
      typeof parsed.pid !== "number" ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid <= 0 ||
      typeof parsed.createdAt !== "string"
    ) {
      return undefined
    }

    return {
      token: parsed.token,
      pid: parsed.pid,
      createdAt: parsed.createdAt,
    }
  } catch {
    return undefined
  }
}

function processIsActive(pid: number): boolean {
  if (pid === process.pid) {
    return true
  }

  try {
    process.kill(pid, PROCESS_EXISTS_SIGNAL)
    return true
  } catch (error) {
    return errorCode(error) !== "ESRCH"
  }
}

function lockOwnerIsInactive(rawPayload: string): boolean {
  const payload = parseLockPayload(rawPayload)
  return payload !== undefined && !processIsActive(payload.pid)
}

function lockPayloadBelongsToToken(rawPayload: string, token: string): boolean {
  return parseLockPayload(rawPayload)?.token === token
}

function readStaleLockPayload(lockPath: string, staleMs: number): string | undefined {
  try {
    const rawPayload = fs.readFileSync(lockPath, "utf8")
    if (lockOwnerIsInactive(rawPayload)) {
      return rawPayload
    }

    const stats = fs.statSync(lockPath)
    return Date.now() - stats.mtimeMs > staleMs ? rawPayload : undefined
  } catch {
    return undefined
  }
}

async function readStaleLockPayloadAsync(
  lockPath: string,
  staleMs: number,
): Promise<string | undefined> {
  try {
    const rawPayload = await fsp.readFile(lockPath, "utf8")
    if (lockOwnerIsInactive(rawPayload)) {
      return rawPayload
    }

    const stats = await fsp.stat(lockPath)
    return Date.now() - stats.mtimeMs > staleMs ? rawPayload : undefined
  } catch {
    return undefined
  }
}

function removeLockIfPayloadMatchesSync(lockPath: string, expectedPayload: string): boolean {
  try {
    if (fs.readFileSync(lockPath, "utf8") !== expectedPayload) {
      return false
    }
    fs.rmSync(lockPath, { force: true })
    return true
  } catch {
    return false
  }
}

async function removeLockIfPayloadMatches(
  lockPath: string,
  expectedPayload: string,
): Promise<boolean> {
  try {
    if ((await fsp.readFile(lockPath, "utf8")) !== expectedPayload) {
      return false
    }
    await fsp.rm(lockPath, { force: true })
    return true
  } catch {
    return false
  }
}

function sleepSync(milliseconds: number): void {
  const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const view = new Int32Array(buffer)
  Atomics.wait(view, 0, 0, milliseconds)
}

function tryAcquireFileLockSync(lockPath: string): FileLockHandle | undefined {
  const token = randomUUID()
  try {
    const handle = fs.openSync(lockPath, "wx")
    try {
      fs.writeFileSync(handle, lockPayload(token), "utf8")
    } finally {
      fs.closeSync(handle)
    }
    return { lockPath, token }
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return undefined
    }
    throw error
  }
}

async function tryAcquireFileLock(lockPath: string): Promise<FileLockHandle | undefined> {
  const token = randomUUID()
  try {
    const handle = await fsp.open(lockPath, "wx")
    try {
      await handle.writeFile(lockPayload(token), "utf8")
    } finally {
      await handle.close()
    }
    return { lockPath, token }
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return undefined
    }
    throw error
  }
}

function removeStaleLockWithGuardSync(lockPath: string, settings: FileLockSettings): boolean {
  const guard = tryAcquireFileLockSync(staleCleanupLockPath(lockPath))
  if (!guard) {
    return false
  }

  try {
    const stalePayload = readStaleLockPayload(lockPath, settings.staleMs)
    return stalePayload ? removeLockIfPayloadMatchesSync(lockPath, stalePayload) : false
  } finally {
    releaseFileLockSync(guard)
  }
}

async function removeStaleLockWithGuard(
  lockPath: string,
  settings: FileLockSettings,
): Promise<boolean> {
  const guard = await tryAcquireFileLock(staleCleanupLockPath(lockPath))
  if (!guard) {
    return false
  }

  try {
    const stalePayload = await readStaleLockPayloadAsync(lockPath, settings.staleMs)
    return stalePayload ? await removeLockIfPayloadMatches(lockPath, stalePayload) : false
  } finally {
    await releaseFileLock(guard)
  }
}

function acquireFileLockSync(lockPath: string, options?: FileLockOptions): FileLockHandle {
  const settings = lockSettings(options)
  const startedAt = Date.now()
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })

  while (true) {
    const handle = tryAcquireFileLockSync(lockPath)
    if (handle) {
      return handle
    }

    if (removeStaleLockWithGuardSync(lockPath, settings)) {
      continue
    }

    if (Date.now() - startedAt > settings.timeoutMs) {
      throw new Error(`Timed out waiting for file lock: ${lockPath}`)
    }

    sleepSync(settings.retryMs)
  }
}

async function acquireFileLock(
  lockPath: string,
  options?: FileLockOptions,
): Promise<FileLockHandle> {
  const settings = lockSettings(options)
  const startedAt = Date.now()
  await fsp.mkdir(path.dirname(lockPath), { recursive: true })

  while (true) {
    const handle = await tryAcquireFileLock(lockPath)
    if (handle) {
      return handle
    }

    if (await removeStaleLockWithGuard(lockPath, settings)) {
      continue
    }

    if (Date.now() - startedAt > settings.timeoutMs) {
      throw new Error(`Timed out waiting for file lock: ${lockPath}`)
    }

    await sleep(settings.retryMs)
  }
}

function releaseFileLockSync(handle: FileLockHandle): void {
  try {
    const payload = fs.readFileSync(handle.lockPath, "utf8")
    if (lockPayloadBelongsToToken(payload, handle.token)) {
      fs.rmSync(handle.lockPath, { force: true })
    }
  } catch {
    return
  }
}

async function releaseFileLock(handle: FileLockHandle): Promise<void> {
  try {
    const payload = await fsp.readFile(handle.lockPath, "utf8")
    if (lockPayloadBelongsToToken(payload, handle.token)) {
      await fsp.rm(handle.lockPath, { force: true })
    }
  } catch {
    return
  }
}

async function refreshFileLock(handle: FileLockHandle): Promise<void> {
  try {
    const payload = await fsp.readFile(handle.lockPath, "utf8")
    if (!lockPayloadBelongsToToken(payload, handle.token)) {
      return
    }

    const now = new Date()
    await fsp.utimes(handle.lockPath, now, now)
  } catch {
    return
  }
}

function startFileLockHeartbeat(handle: FileLockHandle, settings: FileLockSettings): () => void {
  let refreshInProgress = false
  const timer = setInterval(() => {
    if (refreshInProgress) {
      return
    }

    refreshInProgress = true
    void refreshFileLock(handle).finally(() => {
      refreshInProgress = false
    })
  }, settings.heartbeatMs)
  timer.unref()

  return () => {
    clearInterval(timer)
  }
}

function fileLockIsActiveSync(lockPath: string, options?: FileLockOptions): boolean {
  if (!fs.existsSync(lockPath)) {
    return false
  }

  return readStaleLockPayload(lockPath, lockSettings(options).staleMs) === undefined
}

function withFileLockSync<T>(lockPath: string, task: () => T, options?: FileLockOptions): T {
  const handle = acquireFileLockSync(lockPath, options)
  try {
    return task()
  } finally {
    releaseFileLockSync(handle)
  }
}

async function withFileLock<T>(
  lockPath: string,
  task: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const settings = lockSettings(options)
  const handle = await acquireFileLock(lockPath, settings)
  const stopHeartbeat = startFileLockHeartbeat(handle, settings)
  try {
    return await task()
  } finally {
    stopHeartbeat()
    await releaseFileLock(handle)
  }
}

export { fileLockIsActiveSync, withFileLock, withFileLockSync }
