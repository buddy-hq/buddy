import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { verifySignedMessage } from "@buddy/script/minisign"
import { z } from "zod"
import { writeTextFileAtomic } from "../../../storage/atomic-file"

const ENVELOPE_SCHEMA_VERSION = 1
const ARTIFACT_STATE_SCHEMA_VERSION = 1
const ARTIFACT_FETCH_TIMEOUT_MS = 10_000
const ARTIFACT_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024
const ARTIFACT_MAX_ENVELOPE_BYTES = 48 * 1024 * 1024
const ARTIFACT_ENVELOPE_FILE_NAME = "artifact.envelope.json"
const ARTIFACT_STATE_FILE_NAME = "state.json"
const PAYLOAD_ENCODING = "base64"
const SIGNATURE_ENCODING = "tauri-minisign-base64"
const SHA256_HEX_LENGTH = 64

const signedArtifactEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  payloadEncoding: z.literal(PAYLOAD_ENCODING),
  signatureEncoding: z.literal(SIGNATURE_ENCODING),
  payload: z.string().trim().min(1),
  signature: z.string().trim().min(1),
})

const signedArtifactStateSchema = z.strictObject({
  schemaVersion: z.literal(ARTIFACT_STATE_SCHEMA_VERSION),
  highestAcceptedRevision: z.number().int().nonnegative(),
  payloadSha256: z
    .string()
    .trim()
    .length(SHA256_HEX_LENGTH)
    .regex(/^[0-9a-f]+$/),
  acceptedAt: z.string().trim().datetime(),
})

export type SignedArtifactEnvelope = z.infer<typeof signedArtifactEnvelopeSchema>
type SignedArtifactState = z.infer<typeof signedArtifactStateSchema>

export type RevisionedArtifactPayload<T> = {
  value: T
  payloadBytes: Uint8Array
  revision: number
}

export type SignedArtifactSource = "bundled" | "cache" | "remote"

export type SignedArtifactResolution<T> = RevisionedArtifactPayload<T> & {
  payloadSha256: string
  source: SignedArtifactSource
  syncError?: string
}

type SignedArtifactStoreOptions<T> = {
  artifactLabel: string
  cacheRoot: () => string
  loadBundled: () => Promise<RevisionedArtifactPayload<T>>
  parsePayload: (input: unknown) => T
  publicKey: () => string
  remoteUrl: () => string | undefined
  revision: (value: T) => number
  fetch?: ArtifactFetch
  verifySignature?: typeof verifySignedMessage
}

type ArtifactFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type VerifiedEnvelope<T> = {
  envelopeText: string
  resolution: SignedArtifactResolution<T>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJson(source: string, label: string): unknown {
  try {
    const parsed: unknown = JSON.parse(source)
    return parsed
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${errorMessage(error)}`, { cause: error })
  }
}

function payloadSha256(payloadBytes: Uint8Array): string {
  return createHash("sha256").update(payloadBytes).digest("hex")
}

function payloadText(payloadBytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes)
}

function decodePayload(value: string): Uint8Array {
  const normalized = value.trim()
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Signed artifact payload is not valid base64")
  }
  const payloadBytes = Buffer.from(normalized, "base64")
  if (payloadBytes.byteLength > ARTIFACT_MAX_PAYLOAD_BYTES) {
    throw new Error("Signed artifact payload exceeds the decoded payload limit")
  }
  return payloadBytes
}

function decodeTauriSignature(value: string): string {
  const normalized = value.trim()
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Signed artifact signature is not valid base64")
  }
  return Buffer.from(normalized, "base64").toString("utf8")
}

async function readOptionalFile(filepath: string): Promise<string | undefined> {
  return await fsp.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })
}

async function readState(cacheRoot: string): Promise<SignedArtifactState | undefined> {
  const source = await readOptionalFile(path.join(cacheRoot, ARTIFACT_STATE_FILE_NAME))
  if (!source) return undefined
  return signedArtifactStateSchema.parse(parseJson(source, "signed artifact state"))
}

async function writeState(
  cacheRoot: string,
  resolution: SignedArtifactResolution<unknown>,
): Promise<void> {
  const state = signedArtifactStateSchema.parse({
    schemaVersion: ARTIFACT_STATE_SCHEMA_VERSION,
    highestAcceptedRevision: resolution.revision,
    payloadSha256: resolution.payloadSha256,
    acceptedAt: new Date().toISOString(),
  })
  await writeTextFileAtomic(
    path.join(cacheRoot, ARTIFACT_STATE_FILE_NAME),
    `${JSON.stringify(state, null, 2)}\n`,
  )
}

function satisfiesRollbackFloor<T>(
  candidate: SignedArtifactResolution<T>,
  state: SignedArtifactState,
): boolean {
  if (candidate.revision > state.highestAcceptedRevision) return true
  return (
    candidate.revision === state.highestAcceptedRevision &&
    candidate.payloadSha256 === state.payloadSha256
  )
}

function selectActiveResolution<T>(input: {
  bundled: SignedArtifactResolution<T>
  cached?: SignedArtifactResolution<T>
  state?: SignedArtifactState
}): SignedArtifactResolution<T> {
  const candidates = [input.bundled, ...(input.cached ? [input.cached] : [])]
  const state = input.state
  const allowed = state
    ? candidates.filter((candidate) => satisfiesRollbackFloor(candidate, state))
    : candidates

  if (allowed.length === 0) {
    throw new Error(
      `No trusted skill artifact satisfies accepted revision ${input.state?.highestAcceptedRevision}`,
    )
  }

  return allowed.reduce((selected, candidate) => {
    if (candidate.revision > selected.revision) return candidate
    if (candidate.revision < selected.revision) return selected
    if (candidate.payloadSha256 === selected.payloadSha256) return selected
    return selected.source === "bundled" ? selected : candidate
  })
}

async function fetchEnvelopeText(fetcher: ArtifactFetch, url: string): Promise<string> {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "User-Agent": "Buddy-Skill-Artifacts",
    },
    signal: AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Skill artifact fetch failed: ${response.status} ${response.statusText}`)
  }
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > ARTIFACT_MAX_ENVELOPE_BYTES) {
    throw new Error("Skill artifact envelope exceeds the download limit")
  }
  const source = await response.text()
  if (Buffer.byteLength(source, "utf8") > ARTIFACT_MAX_ENVELOPE_BYTES) {
    throw new Error("Skill artifact envelope exceeds the download limit")
  }
  return source
}

export function parseSignedArtifactEnvelope(input: unknown): SignedArtifactEnvelope {
  return signedArtifactEnvelopeSchema.parse(input)
}

export function createSignedArtifactEnvelope(input: {
  payloadBytes: Uint8Array
  tauriSignature: string
}): SignedArtifactEnvelope {
  if (input.payloadBytes.byteLength > ARTIFACT_MAX_PAYLOAD_BYTES) {
    throw new Error("Signed artifact payload exceeds the decoded payload limit")
  }
  return signedArtifactEnvelopeSchema.parse({
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    payloadEncoding: PAYLOAD_ENCODING,
    signatureEncoding: SIGNATURE_ENCODING,
    payload: Buffer.from(input.payloadBytes).toString("base64"),
    signature: input.tauriSignature.trim(),
  })
}

export function createSignedArtifactStore<T>(options: SignedArtifactStoreOptions<T>) {
  let loadedCacheRoot: string | undefined
  let active: SignedArtifactResolution<T> | undefined
  let resolutionTask:
    | {
        cacheRoot: string
        promise: Promise<SignedArtifactResolution<T>>
      }
    | undefined
  let refreshTask: Promise<SignedArtifactResolution<T>> | undefined

  async function verifyEnvelope(
    envelopeText: string,
    source: Exclude<SignedArtifactSource, "bundled">,
  ): Promise<VerifiedEnvelope<T>> {
    const envelope = parseSignedArtifactEnvelope(
      parseJson(envelopeText, `${options.artifactLabel} envelope`),
    )
    const bytes = decodePayload(envelope.payload)
    const verified = await (options.verifySignature ?? verifySignedMessage)({
      message: bytes,
      publicKey: options.publicKey(),
      signatureFileText: decodeTauriSignature(envelope.signature),
    })
    if (!verified) {
      throw new Error(`${options.artifactLabel} signature verification failed`)
    }
    const value = options.parsePayload(
      parseJson(payloadText(bytes), `${options.artifactLabel} payload`),
    )
    return {
      envelopeText,
      resolution: {
        value,
        payloadBytes: bytes,
        revision: options.revision(value),
        payloadSha256: payloadSha256(bytes),
        source,
      },
    }
  }

  async function loadCached(cacheRoot: string): Promise<VerifiedEnvelope<T> | undefined> {
    const source = await readOptionalFile(path.join(cacheRoot, ARTIFACT_ENVELOPE_FILE_NAME))
    if (!source) return undefined
    return await verifyEnvelope(source, "cache")
  }

  async function resolveActiveOnce(cacheRoot: string): Promise<SignedArtifactResolution<T>> {
    const bundledPayload = await options.loadBundled()
    const bundled: SignedArtifactResolution<T> = {
      ...bundledPayload,
      payloadSha256: payloadSha256(bundledPayload.payloadBytes),
      source: "bundled",
    }
    const state = await readState(cacheRoot)
    let cached: SignedArtifactResolution<T> | undefined
    let syncError: string | undefined
    try {
      cached = (await loadCached(cacheRoot))?.resolution
    } catch (error) {
      syncError = errorMessage(error)
    }

    const selected = selectActiveResolution({ bundled, cached, state })
    if (
      !state ||
      selected.revision > state.highestAcceptedRevision ||
      (selected.revision === state.highestAcceptedRevision &&
        selected.payloadSha256 !== state.payloadSha256)
    ) {
      await writeState(cacheRoot, selected)
    }
    const resolved = syncError ? { ...selected, syncError } : selected
    loadedCacheRoot = cacheRoot
    active = resolved
    return resolved
  }

  async function resolveActive(): Promise<SignedArtifactResolution<T>> {
    const cacheRoot = options.cacheRoot()
    if (loadedCacheRoot === cacheRoot && active) return active

    if (resolutionTask?.cacheRoot === cacheRoot) {
      return await resolutionTask.promise
    }

    const promise = resolveActiveOnce(cacheRoot)
    resolutionTask = { cacheRoot, promise }
    try {
      return await promise
    } finally {
      if (resolutionTask?.promise === promise) {
        resolutionTask = undefined
      }
    }
  }

  async function refreshOnce(): Promise<SignedArtifactResolution<T>> {
    let current: SignedArtifactResolution<T> | undefined
    let currentResolutionError: unknown
    try {
      current = await resolveActive()
    } catch (error) {
      currentResolutionError = error
    }
    const url = options.remoteUrl()
    if (!url) {
      if (current) return current
      throw currentResolutionError
    }

    try {
      const envelopeText = await fetchEnvelopeText(options.fetch ?? fetch, url)
      const verified = await verifyEnvelope(envelopeText, "remote")
      const cacheRoot = options.cacheRoot()
      const state = await readState(cacheRoot)
      const acceptedRevision = Math.max(state?.highestAcceptedRevision ?? 0, current?.revision ?? 0)
      if (verified.resolution.revision < acceptedRevision) {
        throw new Error(
          `${options.artifactLabel} revision ${verified.resolution.revision} is older than accepted revision ${acceptedRevision}`,
        )
      }
      const acceptedPayloadSha256 =
        state?.highestAcceptedRevision === acceptedRevision
          ? state.payloadSha256
          : current?.revision === acceptedRevision
            ? current.payloadSha256
            : undefined
      if (
        verified.resolution.revision === acceptedRevision &&
        acceptedPayloadSha256 !== undefined &&
        verified.resolution.payloadSha256 !== acceptedPayloadSha256
      ) {
        throw new Error(
          `${options.artifactLabel} revision ${acceptedRevision} changed without a revision increment`,
        )
      }

      await writeTextFileAtomic(
        path.join(cacheRoot, ARTIFACT_ENVELOPE_FILE_NAME),
        `${JSON.stringify(parseJson(envelopeText, `${options.artifactLabel} envelope`), null, 2)}\n`,
      )
      await writeState(cacheRoot, verified.resolution)
      loadedCacheRoot = cacheRoot
      active = { ...verified.resolution, source: "remote" }
      return active
    } catch (error) {
      if (!current) {
        const currentMessage = errorMessage(currentResolutionError)
        const refreshMessage = errorMessage(error)
        throw new Error(
          `${options.artifactLabel} has no usable local artifact (${currentMessage}); remote recovery failed: ${refreshMessage}`,
          { cause: error },
        )
      }
      active = {
        ...current,
        syncError: errorMessage(error),
      }
      return active
    }
  }

  async function refresh(): Promise<SignedArtifactResolution<T>> {
    if (refreshTask) return await refreshTask
    refreshTask = refreshOnce().finally(() => {
      refreshTask = undefined
    })
    return await refreshTask
  }

  function reset(): void {
    loadedCacheRoot = undefined
    active = undefined
    resolutionTask = undefined
    refreshTask = undefined
  }

  return {
    get: resolveActive,
    refresh,
    reset,
  }
}
