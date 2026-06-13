import { randomUUID } from "node:crypto"
import path from "node:path"
import {
  ARTIFACT_CONTENT_DIRECTORIES,
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_MANIFEST_VERSION,
  ARTIFACT_RUNTIME_DIRECTORIES,
  ArtifactPath,
  ArtifactNotFoundError,
  SHA256_HEX_PATTERN,
  generateArtifactID,
  isNodeErrorCode,
  listArtifactManifests,
  readArtifactManifest as readSharedArtifactManifest,
  readJsonFile,
  readArtifactTextFile,
  sha256Text,
  writeArtifactManifest as writeSharedArtifactManifest,
  writeArtifactRecord,
} from "../../../../artifacts"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  InvalidMermaidRenderKeyError,
  InvalidMermaidRepairRequestIDError,
  MermaidRepairRequestNotFoundError,
  MermaidRenderRecordNotFoundError,
} from "../errors"
import { preflightMermaidSource } from "./preflight"
import {
  MAX_MERMAID_AUTO_REPAIR_ATTEMPTS,
  MERMAID_ARTIFACT_KIND,
  MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  MERMAID_AUTO_REPAIR_TIMEOUT_MS,
  MERMAID_RENDERER_NAME,
  MermaidArtifactManifestSchema,
  MermaidArtifactReadSchema,
  MermaidAutoRepairStateSchema,
  MermaidRepairRequestRecordSchema,
  MermaidRenderRecordSchema,
  MermaidResolvedRenderRecordSchema,
  type MermaidArtifactManifest,
  type MermaidArtifactReadResult,
  type MermaidAutoRepairState,
  type MermaidRenderContrastAdjustment,
  type MermaidRepairRequestRecord,
  type MermaidRenderRecord,
  type MermaidResolvedRenderRecord,
} from "./types"

type CreateMermaidArtifactBaseInput = {
  directory: string
  alt: string
  caption?: string
  source: string
  createdAt?: string
  supersedesArtifactID?: string
}

type CreateToolMermaidArtifactInput = CreateMermaidArtifactBaseInput & {
  sessionID: string
  messageID: string
  callID: string
}

type CreateMarkdownMermaidArtifactInput = CreateMermaidArtifactBaseInput & {
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
}

type ResolveMermaidRenderInput = {
  themeSignature: string
  rendererVersion: string
  renderConfigVersion: number
}

type StoreMermaidRenderRecordInput = ResolveMermaidRenderInput &
  (
    | {
        status: "rendered"
        svg: string
        contrastAdjustments: MermaidRenderContrastAdjustment[]
      }
    | {
        status: "failed"
        errorMessage: string
      }
  )

const MERMAID_EXECUTABLE_SVG_ELEMENT_NAMES = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
] as const
const MERMAID_HTML_CHARACTER_REFERENCES: Record<string, string> = {
  amp: "&",
  apos: "'",
  colon: ":",
  gt: ">",
  lt: "<",
  NewLine: "\n",
  quot: '"',
  Tab: "\t",
}
const MERMAID_HTML_CHARACTER_REFERENCE_PATTERN =
  /&(?:#x([\da-f]+)|#(\d+)|([A-Za-z][A-Za-z\d]+));?/giu
const MERMAID_UNSAFE_REFERENCE_SCHEME_PATTERN = /^(?:javascript:|data:text\/html)/iu
const MERMAID_MIN_URL_SCHEME_IGNORED_CODE_POINT = 0x00
const MERMAID_MAX_URL_SCHEME_SPACE_CODE_POINT = 0x20
const MERMAID_MIN_URL_SCHEME_CONTROL_CODE_POINT = 0x7f
const MERMAID_MAX_URL_SCHEME_CONTROL_CODE_POINT = 0x9f
const MAX_MERMAID_REFERENCE_DECODE_PASSES = 3
const REPAIR_REQUEST_ID_PATTERN = new RegExp(
  `^${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}[A-Za-z0-9_-]+$`,
  "u",
)
const MARKDOWN_MERMAID_CREATION_QUEUE_SEPARATOR = "\u0000"

const markdownMermaidCreationQueues = new Map<string, Promise<void>>()

function markdownMermaidCreationQueueKey(input: {
  directory: string
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  sourceHash: string
}): string {
  return [
    input.directory,
    input.sessionID,
    input.messageID,
    input.partID,
    input.segmentIndex,
    input.sourceHash,
  ].join(MARKDOWN_MERMAID_CREATION_QUEUE_SEPARATOR)
}

async function runMarkdownMermaidCreation(
  input: {
    directory: string
    sessionID: string
    messageID: string
    partID: string
    segmentIndex: number
    sourceHash: string
  },
  operation: () => Promise<MermaidArtifactReadResult>,
): Promise<MermaidArtifactReadResult> {
  const key = markdownMermaidCreationQueueKey(input)
  const previous = markdownMermaidCreationQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(
    () => undefined,
    () => undefined,
  )
  markdownMermaidCreationQueues.set(key, tail)

  try {
    return await current
  } finally {
    if (markdownMermaidCreationQueues.get(key) === tail) {
      markdownMermaidCreationQueues.delete(key)
    }
  }
}

function decodeHtmlCharacterReference(
  match: string,
  hexValue: string | undefined,
  decimalValue: string | undefined,
  namedValue: string | undefined,
): string {
  const numericValue = hexValue
    ? Number.parseInt(hexValue, 16)
    : decimalValue
      ? Number.parseInt(decimalValue, 10)
      : undefined
  if (numericValue !== undefined) {
    try {
      return String.fromCodePoint(numericValue)
    } catch {
      return match
    }
  }

  if (namedValue !== undefined) {
    return MERMAID_HTML_CHARACTER_REFERENCES[namedValue] ?? match
  }

  return match
}

function decodeHtmlCharacterReferences(value: string): string {
  let decoded = value

  for (let pass = 0; pass < MAX_MERMAID_REFERENCE_DECODE_PASSES; pass += 1) {
    const next = decoded.replace(
      MERMAID_HTML_CHARACTER_REFERENCE_PATTERN,
      decodeHtmlCharacterReference,
    )
    if (next === decoded) return decoded
    decoded = next
  }

  return decoded
}

function canonicalizeMermaidReferenceValue(value: string): string {
  return stripMermaidUrlSchemeIgnoredCodePoints(decodeHtmlCharacterReferences(value).trim())
}

function stripMermaidUrlSchemeIgnoredCodePoints(value: string): string {
  let result = ""

  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) continue
    if (
      codePoint >= MERMAID_MIN_URL_SCHEME_IGNORED_CODE_POINT &&
      codePoint <= MERMAID_MAX_URL_SCHEME_SPACE_CODE_POINT
    ) {
      continue
    }
    if (
      codePoint >= MERMAID_MIN_URL_SCHEME_CONTROL_CODE_POINT &&
      codePoint <= MERMAID_MAX_URL_SCHEME_CONTROL_CODE_POINT
    ) {
      continue
    }

    result += character
  }

  return result
}

function isUnsafeMermaidReferenceValue(value: string): boolean {
  return MERMAID_UNSAFE_REFERENCE_SCHEME_PATTERN.test(canonicalizeMermaidReferenceValue(value))
}

function sanitizeMermaidReferenceAttribute(attributeName: string, rawValue: string): string {
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1).trim() : rawValue.trim()

  if (isUnsafeMermaidReferenceValue(value)) {
    return ""
  }

  return ` ${attributeName}=${quote ?? '"'}${value}${quote ?? '"'}`
}

function sanitizeMermaidSvgTagAttributes(source: string): string {
  return source.replace(
    /<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?(\/?)>/gu,
    (
      fullMatch: string,
      tagName: string,
      rawAttributes: string | undefined = "",
      selfClosing: string,
    ) => {
      if (fullMatch.startsWith("</")) return fullMatch

      let attributes = rawAttributes
      attributes = attributes.replace(/\s+on[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
      attributes = attributes.replace(
        /\s+(href|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu,
        (_: string, attributeName: string, rawValue: string) =>
          sanitizeMermaidReferenceAttribute(attributeName, rawValue),
      )

      return `<${tagName}${attributes}${selfClosing}>`
    },
  )
}

function stripMermaidExecutableSvgElements(source: string): string {
  let sanitized = source

  for (const name of MERMAID_EXECUTABLE_SVG_ELEMENT_NAMES) {
    const paired = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, "giu")
    const selfClosing = new RegExp(`<${name}\\b[^>]*/>`, "giu")
    sanitized = sanitized.replace(paired, "")
    sanitized = sanitized.replace(selfClosing, "")
  }

  return sanitized
}

function sanitizeMermaidRenderRecord(record: MermaidRenderRecord): MermaidRenderRecord {
  if (record.status !== "rendered") return record

  return MermaidRenderRecordSchema.parse({
    ...record,
    svg: sanitizeMermaidSvgTagAttributes(stripMermaidExecutableSvgElements(record.svg.trim())),
  })
}

function buildRenderKey(input: {
  sourceHash: string
  rendererVersion: string
  renderConfigVersion: number
  themeSignature: string
}): string {
  return sha256Text(
    [
      "mermaid-render",
      input.sourceHash,
      MERMAID_RENDERER_NAME,
      input.rendererVersion,
      String(input.renderConfigVersion),
      input.themeSignature,
    ].join(":"),
  )
}

function buildMermaidArtifactUrl(directory: string, artifactID: string): string {
  return `/api/artifacts/mermaid/${artifactID}?directory=${encodeURIComponent(directory)}`
}

function sanitizeRenderKey(renderKey: string): string {
  if (!SHA256_HEX_PATTERN.test(renderKey)) {
    throw new InvalidMermaidRenderKeyError(renderKey)
  }
  return renderKey
}

function sanitizeRepairRequestID(repairRequestID: string): string {
  if (!REPAIR_REQUEST_ID_PATTERN.test(repairRequestID)) {
    throw new InvalidMermaidRepairRequestIDError(repairRequestID)
  }
  return repairRequestID
}

function mermaidRenderRecordFile(directory: string, artifactID: string, renderKey: string): string {
  return ArtifactPath.artifactFile(
    directory,
    MERMAID_ARTIFACT_KIND,
    artifactID,
    path.join(
      ARTIFACT_CONTENT_DIRECTORIES.mermaidRenders,
      `${sanitizeRenderKey(renderKey)}.json`,
    ),
  )
}

function mermaidRepairRequestsDirectory(directory: string): string {
  return ArtifactPath.systemDirectory(directory, ARTIFACT_RUNTIME_DIRECTORIES.mermaidRepairRequests)
}

function mermaidRepairRequestFile(directory: string, repairRequestID: string): string {
  return path.join(
    mermaidRepairRequestsDirectory(directory),
    `${sanitizeRepairRequestID(repairRequestID)}.json`,
  )
}

function defaultAutoRepairState(supersedesArtifactID?: string): MermaidAutoRepairState {
  return MermaidAutoRepairStateSchema.parse(
    supersedesArtifactID
      ? {
          status: "not_needed",
          attempts: 0,
        }
      : {
          status: "eligible",
          attempts: 0,
        },
  )
}

function toMermaidArtifactRead(input: {
  manifest: MermaidArtifactManifest
  source: string
  render?: MermaidRenderRecord
}): MermaidArtifactReadResult {
  return MermaidArtifactReadSchema.parse({
    ...input.manifest,
    diagramType: input.manifest.summary.diagramType,
    alt: input.manifest.summary.alt,
    ...(input.manifest.summary.caption ? { caption: input.manifest.summary.caption } : {}),
    preflightRepairs: input.manifest.summary.preflightRepairs,
    autoRepair: input.manifest.summary.autoRepair,
    ...(input.manifest.summary.supersedesArtifactID
      ? { supersedesArtifactID: input.manifest.summary.supersedesArtifactID }
      : {}),
    source: input.source,
    ...(input.render ? { render: input.render } : {}),
  })
}

async function writeArtifactManifest(
  directory: string,
  manifest: MermaidArtifactManifest,
): Promise<void> {
  await writeSharedArtifactManifest({
    directory,
    kind: MERMAID_ARTIFACT_KIND,
    artifactID: manifest.artifactID,
    manifest,
  })
}

async function readArtifactManifest(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactManifest> {
  return readSharedArtifactManifest({
    directory,
    kind: MERMAID_ARTIFACT_KIND,
    artifactID,
    schema: MermaidArtifactManifestSchema,
  })
}

async function createToolMermaidArtifact(
  input: CreateToolMermaidArtifactInput,
): Promise<MermaidArtifactReadResult> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const preflight = preflightMermaidSource(input.source)
  const artifactID = generateArtifactID()
  const manifest = MermaidArtifactManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID,
    kind: MERMAID_ARTIFACT_KIND,
    title: input.alt,
    ...(input.caption ? { description: input.caption } : {}),
    origin: {
      kind: "tool",
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
    },
    sourceHash: preflight.sourceHash,
    summary: {
      diagramType: preflight.diagramType,
      alt: input.alt,
      ...(input.caption ? { caption: input.caption } : {}),
      preflightRepairs: preflight.repairs,
      autoRepair: defaultAutoRepairState(input.supersedesArtifactID),
      ...(input.supersedesArtifactID ? { supersedesArtifactID: input.supersedesArtifactID } : {}),
    },
    createdAt,
    updatedAt: createdAt,
  })
  await writeArtifactRecord({
    directory: input.directory,
    kind: MERMAID_ARTIFACT_KIND,
    artifactID,
    manifest,
    files: [
      {
        relativePath: ARTIFACT_CONTENT_FILES.mermaidSource,
        format: "text",
        content: preflight.source,
      },
    ],
  })
  return toMermaidArtifactRead({ manifest, source: preflight.source })
}

async function createMarkdownMermaidArtifact(
  input: CreateMarkdownMermaidArtifactInput,
): Promise<MermaidArtifactReadResult> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const preflight = preflightMermaidSource(input.source)

  return runMarkdownMermaidCreation(
    {
      directory: input.directory,
      sessionID: input.sessionID,
      messageID: input.messageID,
      partID: input.partID,
      segmentIndex: input.segmentIndex,
      sourceHash: preflight.sourceHash,
    },
    async () => {
      const existing = await findMarkdownMermaidArtifact({
        directory: input.directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
        segmentIndex: input.segmentIndex,
        sourceHash: preflight.sourceHash,
      })
      if (existing) {
        return existing
      }

      const artifactID = generateArtifactID()

      const manifest = MermaidArtifactManifestSchema.parse({
        version: ARTIFACT_MANIFEST_VERSION,
        artifactID,
        kind: MERMAID_ARTIFACT_KIND,
        title: input.alt,
        ...(input.caption ? { description: input.caption } : {}),
        origin: {
          kind: "markdown",
          sessionID: input.sessionID,
          messageID: input.messageID,
          partID: input.partID,
          segmentIndex: input.segmentIndex,
        },
        sourceHash: preflight.sourceHash,
        summary: {
          diagramType: preflight.diagramType,
          alt: input.alt,
          ...(input.caption ? { caption: input.caption } : {}),
          preflightRepairs: preflight.repairs,
          autoRepair: defaultAutoRepairState(input.supersedesArtifactID),
          ...(input.supersedesArtifactID
            ? { supersedesArtifactID: input.supersedesArtifactID }
            : {}),
        },
        createdAt,
        updatedAt: createdAt,
      })
      await writeArtifactRecord({
        directory: input.directory,
        kind: MERMAID_ARTIFACT_KIND,
        artifactID,
        manifest,
        files: [
          {
            relativePath: ARTIFACT_CONTENT_FILES.mermaidSource,
            format: "text",
            content: preflight.source,
          },
        ],
      })
      return toMermaidArtifactRead({ manifest, source: preflight.source })
    },
  )
}

async function findMarkdownMermaidArtifact(input: {
  directory: string
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  sourceHash: string
}): Promise<MermaidArtifactReadResult | undefined> {
  const listed = await listArtifactManifests({
    directory: input.directory,
    kind: MERMAID_ARTIFACT_KIND,
    schema: MermaidArtifactManifestSchema,
  })
  for (const manifest of listed.items) {
    if (manifest.sourceHash !== input.sourceHash) {
      continue
    }
    const origin = manifest.origin
    if (
      origin.kind !== "markdown" ||
      origin.sessionID !== input.sessionID ||
      origin.messageID !== input.messageID ||
      origin.partID !== input.partID ||
      origin.segmentIndex !== input.segmentIndex
    ) {
      continue
    }
    return readMermaidArtifact(input.directory, manifest.artifactID).catch((error) => {
      if (error instanceof ArtifactNotFoundError || isNodeErrorCode(error, "ENOENT")) {
        return undefined
      }
      throw error
    })
  }
  return undefined
}

async function readMermaidRenderRecord(
  directory: string,
  artifactID: string,
  renderKey: string,
): Promise<MermaidRenderRecord> {
  try {
    const record = await readJsonFile(
      mermaidRenderRecordFile(directory, artifactID, renderKey),
      MermaidRenderRecordSchema,
    )
    return sanitizeMermaidRenderRecord(record)
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new MermaidRenderRecordNotFoundError(renderKey)
    }
    throw error
  }
}

async function readMermaidArtifact(
  directory: string,
  artifactID: string,
  input?: { renderKey?: string },
): Promise<MermaidArtifactReadResult> {
  const safeArtifactID = ArtifactPath.sanitizeArtifactID(artifactID)
  const [manifest, source, render] = await Promise.all([
    readArtifactManifest(directory, safeArtifactID),
    readArtifactTextFile({
      directory,
      kind: MERMAID_ARTIFACT_KIND,
      artifactID: safeArtifactID,
      relativePath: ARTIFACT_CONTENT_FILES.mermaidSource,
    }),
    input?.renderKey
      ? readMermaidRenderRecord(directory, safeArtifactID, input.renderKey).catch((error) => {
          if (error instanceof MermaidRenderRecordNotFoundError) {
            return undefined
          }
          throw error
        })
      : Promise.resolve(undefined),
  ])
  return toMermaidArtifactRead({ manifest, source, ...(render ? { render } : {}) })
}

async function readReusableMermaidRenderRecord(input: {
  directory: string
  artifact: MermaidArtifactReadResult
  renderKey: string
}): Promise<MermaidRenderRecord | undefined> {
  const listed = await listArtifactManifests({
    directory: input.directory,
    kind: MERMAID_ARTIFACT_KIND,
    schema: MermaidArtifactManifestSchema,
  })
  for (const manifest of listed.items) {
    if (manifest.artifactID === input.artifact.artifactID) continue
    if (manifest.sourceHash !== input.artifact.sourceHash) {
      continue
    }

    const reusable = await readMermaidRenderRecord(
      input.directory,
      manifest.artifactID,
      input.renderKey,
    ).catch((error) => {
      if (error instanceof MermaidRenderRecordNotFoundError) {
        return undefined
      }
      throw error
    })
    if (!reusable) {
      continue
    }

    const currentArtifactRecord = MermaidRenderRecordSchema.parse({
      ...reusable,
      artifactID: input.artifact.artifactID,
    })
    await writeJsonFileAtomic(
      mermaidRenderRecordFile(
        input.directory,
        input.artifact.artifactID,
        input.renderKey,
      ),
      currentArtifactRecord,
    )
    return currentArtifactRecord
  }

  return undefined
}

async function resolveMermaidRenderRecord(
  directory: string,
  artifactID: string,
  input: ResolveMermaidRenderInput,
): Promise<MermaidResolvedRenderRecord> {
  const artifact = await readMermaidArtifact(directory, artifactID)
  const renderKey = buildRenderKey({
    sourceHash: artifact.sourceHash,
    rendererVersion: input.rendererVersion,
    renderConfigVersion: input.renderConfigVersion,
    themeSignature: input.themeSignature,
  })
  let render = await readMermaidRenderRecord(directory, artifact.artifactID, renderKey).catch(
    (error) => {
      if (error instanceof MermaidRenderRecordNotFoundError) {
        return undefined
      }
      throw error
    },
  )
  render ??= await readReusableMermaidRenderRecord({ directory, artifact, renderKey })
  return MermaidResolvedRenderRecordSchema.parse({
    renderKey,
    ...(render ? { render } : {}),
  })
}

async function storeMermaidRenderRecord(
  directory: string,
  artifactID: string,
  input: StoreMermaidRenderRecordInput,
): Promise<MermaidRenderRecord> {
  const artifact = await readMermaidArtifact(directory, artifactID)
  const renderKey = buildRenderKey({
    sourceHash: artifact.sourceHash,
    rendererVersion: input.rendererVersion,
    renderConfigVersion: input.renderConfigVersion,
    themeSignature: input.themeSignature,
  })
  const renderedAt = new Date().toISOString()
  const record = MermaidRenderRecordSchema.parse(
    input.status === "rendered"
      ? {
          renderKey,
          artifactID: artifact.artifactID,
          sourceHash: artifact.sourceHash,
          status: "rendered",
          svg: sanitizeMermaidSvgTagAttributes(stripMermaidExecutableSvgElements(input.svg.trim())),
          contrastAdjustments: input.contrastAdjustments,
          rendererName: MERMAID_RENDERER_NAME,
          rendererVersion: input.rendererVersion,
          renderConfigVersion: input.renderConfigVersion,
          themeSignature: input.themeSignature,
          renderedAt,
        }
      : {
          renderKey,
          artifactID: artifact.artifactID,
          sourceHash: artifact.sourceHash,
          status: "failed",
          errorMessage: input.errorMessage,
          rendererName: MERMAID_RENDERER_NAME,
          rendererVersion: input.rendererVersion,
          renderConfigVersion: input.renderConfigVersion,
          themeSignature: input.themeSignature,
          renderedAt,
        },
  )
  await writeJsonFileAtomic(
    mermaidRenderRecordFile(directory, artifact.artifactID, renderKey),
    record,
  )
  return record
}

async function updateMermaidAutoRepairState(
  directory: string,
  artifactID: string,
  state: MermaidAutoRepairState,
): Promise<MermaidArtifactReadResult> {
  const artifact = await readMermaidArtifact(directory, artifactID)
  const manifest = MermaidArtifactManifestSchema.parse({
    ...artifact,
    summary: {
      ...artifact.summary,
      autoRepair: state,
    },
    updatedAt: new Date().toISOString(),
  })
  await writeArtifactManifest(directory, manifest)
  return toMermaidArtifactRead({ manifest, source: artifact.source })
}

async function createMermaidRepairRequest(input: {
  directory: string
  sessionID: string
  artifactID: string
  failedRenderKey: string
  createdAt?: string
}): Promise<MermaidRepairRequestRecord> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(createdAt) + MERMAID_AUTO_REPAIR_TIMEOUT_MS).toISOString()
  const repairRequestID = `${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}${randomUUID().replaceAll("-", "_")}`
  const request = MermaidRepairRequestRecordSchema.parse({
    repairRequestID,
    artifactID: input.artifactID,
    failedRenderKey: input.failedRenderKey,
    sessionID: input.sessionID,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    expiresAt,
  })
  await writeJsonFileAtomic(
    mermaidRepairRequestFile(input.directory, request.repairRequestID),
    request,
  )
  return request
}

async function readMermaidRepairRequest(
  directory: string,
  repairRequestID: string,
): Promise<MermaidRepairRequestRecord> {
  try {
    return await readJsonFile(
      mermaidRepairRequestFile(directory, repairRequestID),
      MermaidRepairRequestRecordSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new MermaidRepairRequestNotFoundError(repairRequestID)
    }
    throw error
  }
}

async function updateMermaidRepairRequest(
  directory: string,
  repairRequestID: string,
  input: {
    status: "running" | "succeeded" | "exhausted"
    replacementArtifactID?: string
    lastErrorMessage?: string
  },
): Promise<MermaidRepairRequestRecord> {
  const current = await readMermaidRepairRequest(directory, repairRequestID)
  const updated = MermaidRepairRequestRecordSchema.parse({
    ...current,
    status: input.status,
    updatedAt: new Date().toISOString(),
    replacementArtifactID:
      input.status === "succeeded" ? input.replacementArtifactID : current.replacementArtifactID,
    lastErrorMessage:
      input.status === "exhausted" ? input.lastErrorMessage : current.lastErrorMessage,
  })
  await writeJsonFileAtomic(
    mermaidRepairRequestFile(directory, repairRequestID),
    updated,
  )
  return updated
}

function isMermaidRepairExpired(request: MermaidRepairRequestRecord): boolean {
  return request.status === "running" && Date.now() >= Date.parse(request.expiresAt)
}

function nextExhaustedAutoRepairState(message: string): MermaidAutoRepairState {
  return MermaidAutoRepairStateSchema.parse({
    status: "exhausted",
    attempts: MAX_MERMAID_AUTO_REPAIR_ATTEMPTS,
    lastErrorMessage: message,
  })
}

export {
  buildMermaidArtifactUrl,
  buildRenderKey,
  createMarkdownMermaidArtifact,
  createMermaidRepairRequest,
  createToolMermaidArtifact,
  isMermaidRepairExpired,
  nextExhaustedAutoRepairState,
  readMermaidRepairRequest,
  readMermaidArtifact,
  readMermaidRenderRecord,
  resolveMermaidRenderRecord,
  storeMermaidRenderRecord,
  updateMermaidRepairRequest,
  updateMermaidAutoRepairState,
}

export type {
  CreateMarkdownMermaidArtifactInput,
  CreateToolMermaidArtifactInput,
  ResolveMermaidRenderInput,
  StoreMermaidRenderRecordInput,
}
