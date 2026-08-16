import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { BUDDY_DIRECTORY_NAME } from "../../../../objects"
import { withFileLock } from "../../../../storage/file-lock"
import {
  captureTextFileWriteSnapshot,
  resolveAtomicWriteTarget,
  textFileWriteLockPath,
  writeTextFileAtomicLocked,
  type TextFileWriteSnapshot,
} from "../../../../storage/locked-atomic-file"
import {
  SvgSourceFormatSchema,
  SvgSourceHashSchema,
  SvgTextSourceSchema,
  SVG_RENDER_MAX_ERROR_CHARACTERS,
  type SvgSourceFormat,
} from "./contracts"

const SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_svg_auto_repair_" as const
const SVG_AUTO_REPAIR_RECORD_VERSION = 1 as const
const SVG_AUTO_REPAIR_RUNTIME_ID = randomUUID()
const SVG_AUTO_REPAIR_RESTARTED_MESSAGE =
  "Automatic SVG repair was interrupted by a backend restart."
const SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS = 4
const SVG_AUTO_REPAIR_SCRATCH_CLEANUP_DELAY_MS = 1_000
const SVG_AUTO_REPAIR_RECORD_MAX_ENTRIES = 2_048
const SVG_AUTO_REPAIR_RECORD_MAX_BYTES = 32 * 1024 * 1024
const SVG_AUTO_REPAIR_RETENTION_LOCK_FILENAME = ".retention.lock"
const SVG_AUTO_REPAIR_DIRECTORY_SEGMENTS = [
  BUDDY_DIRECTORY_NAME,
  "auto-repair",
  "svg",
  `v${SVG_AUTO_REPAIR_RECORD_VERSION}`,
] as const
const SVG_AUTO_REPAIR_ID_PATTERN = /^msg_buddy_svg_auto_repair_[a-f0-9]{64}$/u
const SVG_AUTO_REPAIR_RECORD_FILENAME_PATTERN = /^(msg_buddy_svg_auto_repair_[a-f0-9]{64})\.json$/u

const SvgAutoRepairRequestSchema = z
  .object({
    version: z.literal(SVG_AUTO_REPAIR_RECORD_VERSION),
    runtimeID: z.string().uuid(),
    repairRequestID: z.string().regex(SVG_AUTO_REPAIR_ID_PATTERN),
    sessionID: z.string().min(1),
    assistantMessageID: z.string().min(1),
    partID: z.string().min(1),
    segmentIndex: z.number().int().nonnegative(),
    format: SvgSourceFormatSchema,
    source: SvgTextSourceSchema.optional(),
    sourceHash: SvgSourceHashSchema,
    status: z.enum(["running", "validated", "exhausted"]),
    renderAttempts: z.number().int().nonnegative().max(SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    activeRenderAttemptID: z.string().min(1).optional(),
    turnSettled: z.boolean().optional(),
    validatedSourceHash: SvgSourceHashSchema.optional(),
    lastErrorMessage: z.string().min(1).max(SVG_RENDER_MAX_ERROR_CHARACTERS).optional(),
  })
  .strict()

type SvgAutoRepairRequest = z.infer<typeof SvgAutoRepairRequestSchema>
type SvgAutoRepairRequestRead = {
  request: SvgAutoRepairRequest
  snapshot: TextFileWriteSnapshot
}
type SvgAutoRepairRecordLimits = {
  maxEntries: number
  maxBytes: number
}
type SvgAutoRepairRecordCandidate = {
  requestID: string
  fileName: string
  size: number
  modifiedAt: number
}

const DEFAULT_SVG_AUTO_REPAIR_RECORD_LIMITS: SvgAutoRepairRecordLimits = {
  maxEntries: SVG_AUTO_REPAIR_RECORD_MAX_ENTRIES,
  maxBytes: SVG_AUTO_REPAIR_RECORD_MAX_BYTES,
}

function isNodeErrorCode<TError>(error: TError, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function parseSvgAutoRepairRequest(rawText: string): SvgAutoRepairRequest | undefined {
  try {
    const raw: unknown = JSON.parse(rawText)
    const parsed = SvgAutoRepairRequestSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function boundedSvgAutoRepairErrorMessage(value: string): string {
  const normalized = value.trim() || "Automatic SVG repair failed."
  return normalized.slice(0, SVG_RENDER_MAX_ERROR_CHARACTERS)
}

function requestIdentity(input: {
  sessionID: string
  assistantMessageID: string
  partID: string
  format: SvgSourceFormat
  sourceHash: string
}): string {
  return [
    input.sessionID,
    input.assistantMessageID,
    input.partID,
    input.format,
    input.sourceHash,
  ].join("\u0000")
}

function repairRequestID(input: {
  sessionID: string
  assistantMessageID: string
  partID: string
  segmentIndex: number
  format: SvgSourceFormat
  sourceHash: string
}): string {
  const digest = createHash("sha256").update(requestIdentity(input)).digest("hex")
  return `${SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX}${digest}`
}

function assertRepairRequestID(value: string): string {
  if (!SVG_AUTO_REPAIR_ID_PATTERN.test(value)) {
    throw new Error("Invalid SVG auto-repair request ID.")
  }
  return value
}

function repairRoot(directory: string): string {
  return path.join(directory, ...SVG_AUTO_REPAIR_DIRECTORY_SEGMENTS)
}

function repairFile(directory: string, requestID: string): string {
  return path.join(repairRoot(directory), `${assertRepairRequestID(requestID)}.json`)
}

function svgAutoRepairScratchFile(directory: string, requestID: string): string {
  return path.join(repairRoot(directory), `${assertRepairRequestID(requestID)}.svg`)
}

async function resolveSvgAutoRepairStoragePath(
  directory: string,
  targetPath: string,
): Promise<string> {
  const lexicalDirectory = path.resolve(directory)
  const lexicalTargetPath = path.resolve(targetPath)
  const relativeTargetPath = path.relative(lexicalDirectory, lexicalTargetPath)
  if (
    relativeTargetPath === "" ||
    relativeTargetPath === ".." ||
    relativeTargetPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTargetPath)
  ) {
    throw new Error("SVG auto-repair storage path escapes the project directory.")
  }

  const realDirectory = await fs.realpath(lexicalDirectory)
  const expectedTargetPath = path.join(realDirectory, relativeTargetPath)
  const resolvedTargetPath = await resolveAtomicWriteTarget(lexicalTargetPath)
  if (resolvedTargetPath !== expectedTargetPath) {
    throw new Error("SVG auto-repair storage path is redirected by a symbolic link.")
  }
  return resolvedTargetPath
}

async function readSvgAutoRepairRequest(
  directory: string,
  requestID: string,
): Promise<SvgAutoRepairRequest> {
  const targetPath = await resolveSvgAutoRepairStoragePath(
    directory,
    repairFile(directory, requestID),
  )
  const raw: unknown = JSON.parse(await fs.readFile(targetPath, "utf8"))
  return SvgAutoRepairRequestSchema.parse(raw)
}

async function readSvgAutoRepairRequestWithSnapshot(
  directory: string,
  requestID: string,
): Promise<SvgAutoRepairRequestRead> {
  const targetPath = await resolveSvgAutoRepairStoragePath(
    directory,
    repairFile(directory, requestID),
  )
  const rawText = await fs.readFile(targetPath, "utf8")
  const snapshot = await captureTextFileWriteSnapshot(targetPath)
  const readVersion = createHash("sha256").update(rawText).digest("hex")
  if (snapshot.targetPath !== targetPath || snapshot.version !== readVersion) {
    throw new Error("SVG auto-repair record changed while it was being read.")
  }
  const raw: unknown = JSON.parse(rawText)
  return {
    request: SvgAutoRepairRequestSchema.parse(raw),
    snapshot,
  }
}

async function writeSvgAutoRepairRequest(
  directory: string,
  requestID: string,
  request: SvgAutoRepairRequest,
  expectedSnapshot: TextFileWriteSnapshot,
): Promise<void> {
  const targetPath = await resolveSvgAutoRepairStoragePath(
    directory,
    repairFile(directory, requestID),
  )
  if (expectedSnapshot.targetPath !== targetPath) {
    throw new Error("SVG auto-repair record target changed before it could be saved.")
  }
  await writeTextFileAtomicLocked({
    targetPath,
    content: `${JSON.stringify(request, null, 2)}\n`,
    expectedSnapshot,
  })
}

async function readSvgAutoRepairRequestIfPresentUnlocked(
  directory: string,
  requestID: string,
): Promise<SvgAutoRepairRequest | undefined> {
  try {
    return (await readSvgAutoRepairRequestWithSnapshot(directory, requestID)).request
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

async function readSvgAutoRepairRequestIfPresent(
  directory: string,
  requestID: string,
): Promise<SvgAutoRepairRequest | undefined> {
  try {
    return await readSvgAutoRepairRequest(directory, requestID)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

async function createSvgAutoRepairRequest(input: {
  directory: string
  sessionID: string
  assistantMessageID: string
  partID: string
  segmentIndex: number
  format: SvgSourceFormat
  source: string
  sourceHash: string
}): Promise<{ created: boolean; request: SvgAutoRepairRequest }> {
  const requestID = repairRequestID(input)
  return withSvgAutoRepairRetentionLock(input.directory, async () => {
    const result = await withSvgAutoRepairRequestLock(input.directory, requestID, async () => {
      const existing = await readSvgAutoRepairRequestIfPresentUnlocked(input.directory, requestID)
      if (existing) return { created: false, request: existing }

      const now = new Date().toISOString()
      const request = SvgAutoRepairRequestSchema.parse({
        version: SVG_AUTO_REPAIR_RECORD_VERSION,
        runtimeID: SVG_AUTO_REPAIR_RUNTIME_ID,
        repairRequestID: requestID,
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        partID: input.partID,
        segmentIndex: input.segmentIndex,
        format: input.format,
        source: input.source,
        sourceHash: input.sourceHash,
        status: "running",
        renderAttempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      const targetPath = await resolveSvgAutoRepairStoragePath(
        input.directory,
        repairFile(input.directory, requestID),
      )
      const snapshot = await captureTextFileWriteSnapshot(targetPath)
      if (snapshot.version !== null) {
        throw new Error("SVG auto-repair record appeared while it was being created.")
      }
      await writeSvgAutoRepairRequest(input.directory, requestID, request, snapshot)
      return { created: true, request }
    })
    if (result.created) {
      await enforceSvgAutoRepairRecordLimitsUnlocked(
        input.directory,
        DEFAULT_SVG_AUTO_REPAIR_RECORD_LIMITS,
      )
    }
    return result
  })
}

async function findSvgAutoRepairRequest(input: {
  directory: string
  sessionID: string
  assistantMessageID: string
  partID: string
  segmentIndex: number
  format: SvgSourceFormat
  sourceHash: string
}): Promise<SvgAutoRepairRequest | undefined> {
  const existing = await readSvgAutoRepairRequestIfPresent(input.directory, repairRequestID(input))
  if (existing?.status === "running" && existing.runtimeID !== SVG_AUTO_REPAIR_RUNTIME_ID) {
    return exhaustSvgAutoRepairRequest({
      directory: input.directory,
      requestID: existing.repairRequestID,
      errorMessage: SVG_AUTO_REPAIR_RESTARTED_MESSAGE,
    })
  }
  return existing
}

async function updateSvgAutoRepairRequest(input: {
  directory: string
  requestID: string
  update: (current: SvgAutoRepairRequest) => SvgAutoRepairRequest
}): Promise<SvgAutoRepairRequest> {
  const current = await readSvgAutoRepairRequestWithSnapshot(input.directory, input.requestID)
  const next = SvgAutoRepairRequestSchema.parse(input.update(current.request))
  await writeSvgAutoRepairRequest(input.directory, input.requestID, next, current.snapshot)
  return next
}

async function withSvgAutoRepairRequestLock<T>(
  directory: string,
  requestID: string,
  operation: () => Promise<T>,
): Promise<T> {
  const targetPath = await resolveSvgAutoRepairStoragePath(
    directory,
    repairFile(directory, requestID),
  )
  return withFileLock(`${targetPath}.lock`, operation)
}

async function withSvgAutoRepairRetentionLock<T>(
  directory: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = await resolveSvgAutoRepairStoragePath(
    directory,
    path.join(repairRoot(directory), SVG_AUTO_REPAIR_RETENTION_LOCK_FILENAME),
  )
  return withFileLock(lockPath, operation)
}

async function listSvgAutoRepairRecordCandidates(
  directory: string,
): Promise<SvgAutoRepairRecordCandidate[]> {
  const rootPath = await resolveSvgAutoRepairStoragePath(
    directory,
    path.join(repairRoot(directory), SVG_AUTO_REPAIR_RETENTION_LOCK_FILENAME),
  ).then(path.dirname)
  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  const candidates = await Promise.all(
    entries.flatMap((entry) => {
      if (!entry.isFile()) return []
      const match = SVG_AUTO_REPAIR_RECORD_FILENAME_PATTERN.exec(entry.name)
      if (!match) return []
      const requestID = match[1]
      if (!requestID) return []
      return [
        fs
          .stat(path.join(rootPath, entry.name))
          .then(
            (stats): SvgAutoRepairRecordCandidate => ({
              requestID,
              fileName: entry.name,
              size: stats.size,
              modifiedAt: stats.mtimeMs,
            }),
          )
          .catch((error) => {
            if (isNodeErrorCode(error, "ENOENT")) return undefined
            throw error
          }),
      ]
    }),
  )
  return candidates
    .filter((candidate) => candidate !== undefined)
    .toSorted(
      (left, right) =>
        left.modifiedAt - right.modifiedAt || left.fileName.localeCompare(right.fileName),
    )
}

async function removeTerminalSvgAutoRepairRecord(
  directory: string,
  candidate: SvgAutoRepairRecordCandidate,
): Promise<boolean> {
  return withSvgAutoRepairRequestLock(directory, candidate.requestID, async () => {
    const targetPath = await resolveSvgAutoRepairStoragePath(
      directory,
      repairFile(directory, candidate.requestID),
    )
    return withFileLock(textFileWriteLockPath(targetPath), async () => {
      let rawText: string
      try {
        rawText = await fs.readFile(targetPath, "utf8")
      } catch (error) {
        if (isNodeErrorCode(error, "ENOENT")) return true
        throw error
      }
      const request = parseSvgAutoRepairRequest(rawText)
      if (request?.status === "running" && request.runtimeID === SVG_AUTO_REPAIR_RUNTIME_ID) {
        return false
      }
      await fs.rm(targetPath)
      return true
    })
  })
}

async function enforceSvgAutoRepairRecordLimitsUnlocked(
  directory: string,
  limits: SvgAutoRepairRecordLimits,
): Promise<void> {
  const candidates = await listSvgAutoRepairRecordCandidates(directory)
  let entryCount = candidates.length
  let totalBytes = candidates.reduce((total, candidate) => total + candidate.size, 0)
  if (entryCount <= limits.maxEntries && totalBytes <= limits.maxBytes) return

  for (const candidate of candidates) {
    if (entryCount <= limits.maxEntries && totalBytes <= limits.maxBytes) return
    if (!(await removeTerminalSvgAutoRepairRecord(directory, candidate))) continue
    entryCount -= 1
    totalBytes -= candidate.size
  }
}

async function enforceSvgAutoRepairRecordLimits(
  directory: string,
  limits: SvgAutoRepairRecordLimits = DEFAULT_SVG_AUTO_REPAIR_RECORD_LIMITS,
): Promise<void> {
  if (
    !Number.isSafeInteger(limits.maxEntries) ||
    limits.maxEntries < 0 ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 0
  ) {
    throw new Error("SVG auto-repair record limits must be non-negative safe integers.")
  }
  await withSvgAutoRepairRetentionLock(directory, () =>
    enforceSvgAutoRepairRecordLimitsUnlocked(directory, limits),
  )
}

function scheduleSvgAutoRepairScratchCleanup(directory: string, requestID: string): void {
  const filePath = svgAutoRepairScratchFile(directory, requestID)
  const timer = globalThis.setTimeout(() => {
    void fs.rm(filePath, { force: true }).catch(() => undefined)
  }, SVG_AUTO_REPAIR_SCRATCH_CLEANUP_DELAY_MS)
  timer.unref?.()
}

async function beginSvgAutoRepairRenderAttempt(input: {
  attemptID: string
  directory: string
  requestID: string
}): Promise<SvgAutoRepairRequest> {
  return withSvgAutoRepairRequestLock(input.directory, input.requestID, async () =>
    updateSvgAutoRepairRequest({
      directory: input.directory,
      requestID: input.requestID,
      update(current) {
        if (current.runtimeID !== SVG_AUTO_REPAIR_RUNTIME_ID) {
          throw new Error("SVG auto-repair request is no longer active after a backend restart.")
        }
        if (current.activeRenderAttemptID) {
          throw new Error("Another render_svg call is already evaluating this repair request.")
        }
        if (current.status === "validated") {
          throw new Error(
            "SVG source has already rendered successfully; emit the corrected fence now.",
          )
        }
        if (
          current.status === "exhausted" ||
          current.renderAttempts >= SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS
        ) {
          throw new Error(
            `The SVG repair turn has used all ${SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS} render attempts. Do not call render_svg again.`,
          )
        }
        return {
          ...current,
          activeRenderAttemptID: input.attemptID,
          renderAttempts: current.renderAttempts + 1,
          updatedAt: new Date().toISOString(),
        }
      },
    }),
  )
}

async function completeSvgAutoRepairRenderAttempt(input: {
  attemptID: string
  directory: string
  requestID: string
  sourceHash: string
  errorMessage?: string
}): Promise<SvgAutoRepairRequest> {
  return withSvgAutoRepairRequestLock(input.directory, input.requestID, async () =>
    updateSvgAutoRepairRequest({
      directory: input.directory,
      requestID: input.requestID,
      update(current) {
        if (current.activeRenderAttemptID !== input.attemptID) {
          throw new Error("SVG auto-repair render attempt is no longer active.")
        }
        const now = new Date().toISOString()
        if (!input.errorMessage) {
          const {
            activeRenderAttemptID: _completedAttemptID,
            source: _source,
            turnSettled: _turnSettled,
            ...completed
          } = current
          return {
            ...completed,
            status: "validated",
            validatedSourceHash: input.sourceHash,
            updatedAt: now,
          }
        }
        const {
          activeRenderAttemptID: _completedAttemptID,
          turnSettled: _turnSettled,
          ...completed
        } = current
        const exhausted =
          current.turnSettled || current.renderAttempts >= SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS
        if (exhausted) {
          const { source: _source, ...terminal } = completed
          return {
            ...terminal,
            status: "exhausted",
            lastErrorMessage: boundedSvgAutoRepairErrorMessage(input.errorMessage),
            updatedAt: now,
          }
        }
        return {
          ...completed,
          status: "running",
          lastErrorMessage: boundedSvgAutoRepairErrorMessage(input.errorMessage),
          updatedAt: now,
        }
      },
    }),
  )
}

async function settleSvgAutoRepairTurn(input: {
  directory: string
  requestID: string
  errorMessage: string
}): Promise<SvgAutoRepairRequest> {
  return withSvgAutoRepairRequestLock(input.directory, input.requestID, async () =>
    updateSvgAutoRepairRequest({
      directory: input.directory,
      requestID: input.requestID,
      update(current) {
        if (current.status !== "running") return current
        if (current.activeRenderAttemptID) {
          return {
            ...current,
            turnSettled: true,
            lastErrorMessage: boundedSvgAutoRepairErrorMessage(input.errorMessage),
            updatedAt: new Date().toISOString(),
          }
        }
        const { source: _source, ...exhausted } = current
        return {
          ...exhausted,
          status: "exhausted",
          lastErrorMessage: boundedSvgAutoRepairErrorMessage(input.errorMessage),
          updatedAt: new Date().toISOString(),
        }
      },
    }),
  )
}

async function exhaustSvgAutoRepairRequest(input: {
  directory: string
  requestID: string
  errorMessage: string
}): Promise<SvgAutoRepairRequest> {
  return withSvgAutoRepairRequestLock(input.directory, input.requestID, async () =>
    updateSvgAutoRepairRequest({
      directory: input.directory,
      requestID: input.requestID,
      update(current) {
        if (current.status !== "running") return current
        const {
          activeRenderAttemptID: _activeAttemptID,
          source: _source,
          turnSettled: _turnSettled,
          ...exhausted
        } = current
        return {
          ...exhausted,
          status: "exhausted",
          lastErrorMessage: boundedSvgAutoRepairErrorMessage(input.errorMessage),
          updatedAt: new Date().toISOString(),
        }
      },
    }),
  )
}

function isSvgAutoRepairMessageID<TValue>(value: TValue): boolean {
  const parsed = z.string().safeParse(value)
  return parsed.success && SVG_AUTO_REPAIR_ID_PATTERN.test(parsed.data)
}

export {
  SVG_AUTO_REPAIR_MAX_RENDER_ATTEMPTS,
  SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  SvgAutoRepairRequestSchema,
  beginSvgAutoRepairRenderAttempt,
  completeSvgAutoRepairRenderAttempt,
  createSvgAutoRepairRequest,
  enforceSvgAutoRepairRecordLimits,
  exhaustSvgAutoRepairRequest,
  findSvgAutoRepairRequest,
  isSvgAutoRepairMessageID,
  readSvgAutoRepairRequest,
  resolveSvgAutoRepairStoragePath,
  scheduleSvgAutoRepairScratchCleanup,
  settleSvgAutoRepairTurn,
  svgAutoRepairScratchFile,
}
export type { SvgAutoRepairRecordLimits, SvgAutoRepairRequest }
