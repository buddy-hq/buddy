import { createHash, randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  MermaidArtifactNotFoundError,
  MermaidRepairRequestNotFoundError,
  MermaidRenderRecordNotFoundError,
} from "../errors"
import { MermaidArtifactPathV2 } from "./v2-path"
import { preflightMermaidSource } from "./v2-preflight"
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
} from "./v2-types"

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
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

function buildToolArtifactID(input: {
  sessionID: string
  messageID: string
  callID: string
  createdAt: string
  sourceHash: string
}): string {
  return sha256(
    [
      "mermaid.v2:tool",
      input.sessionID,
      input.messageID,
      input.callID,
      input.createdAt,
      input.sourceHash,
    ].join(":"),
  )
}

function buildMarkdownArtifactID(input: {
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  sourceHash: string
}): string {
  return sha256(
    [
      "mermaid.v2:markdown",
      input.sessionID,
      input.messageID,
      input.partID,
      String(input.segmentIndex),
      input.sourceHash,
    ].join(":"),
  )
}

function buildRenderKey(input: {
  sourceHash: string
  rendererVersion: string
  renderConfigVersion: number
  themeSignature: string
}): string {
  return sha256(
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
  return `/api/mermaid-artifacts/${artifactID}?directory=${encodeURIComponent(directory)}`
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

async function writeAtomicJson(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
  )
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await fs.rename(tempPath, targetPath)
}

async function writeArtifactManifest(
  directory: string,
  manifest: MermaidArtifactManifest,
): Promise<void> {
  await writeAtomicJson(
    MermaidArtifactPathV2.manifestFile(directory, manifest.artifactID),
    manifest,
  )
}

async function writeArtifactSource(
  directory: string,
  artifactID: string,
  source: string,
): Promise<void> {
  await fs.mkdir(MermaidArtifactPathV2.artifactDirectory(directory, artifactID), {
    recursive: true,
  })
  await fs.writeFile(MermaidArtifactPathV2.sourceFile(directory, artifactID), source, "utf8")
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const text = await fs.readFile(filePath, "utf8")
  return schema.parse(JSON.parse(text) as unknown)
}

async function readArtifactManifest(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactManifest> {
  try {
    return await readJsonFile(
      MermaidArtifactPathV2.manifestFile(directory, artifactID),
      MermaidArtifactManifestSchema,
    )
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new MermaidArtifactNotFoundError(artifactID)
    }
    throw error
  }
}

async function createToolMermaidArtifact(
  input: CreateToolMermaidArtifactInput,
): Promise<MermaidArtifactReadResult> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const preflight = preflightMermaidSource(input.source)
  const artifactID = buildToolArtifactID({
    sessionID: input.sessionID,
    messageID: input.messageID,
    callID: input.callID,
    createdAt,
    sourceHash: preflight.sourceHash,
  })
  const manifest = MermaidArtifactManifestSchema.parse({
    version: 2,
    artifactID,
    kind: MERMAID_ARTIFACT_KIND,
    origin: {
      kind: "tool",
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
    },
    diagramType: preflight.diagramType,
    alt: input.alt,
    ...(input.caption ? { caption: input.caption } : {}),
    sourceHash: preflight.sourceHash,
    preflightRepairs: preflight.repairs,
    autoRepair: defaultAutoRepairState(input.supersedesArtifactID),
    createdAt,
    updatedAt: createdAt,
    ...(input.supersedesArtifactID ? { supersedesArtifactID: input.supersedesArtifactID } : {}),
  })
  await Promise.all([
    writeArtifactManifest(input.directory, manifest),
    writeArtifactSource(input.directory, artifactID, preflight.source),
  ])
  return MermaidArtifactReadSchema.parse({
    ...manifest,
    source: preflight.source,
  })
}

async function createMarkdownMermaidArtifact(
  input: CreateMarkdownMermaidArtifactInput,
): Promise<MermaidArtifactReadResult> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const preflight = preflightMermaidSource(input.source)
  const artifactID = buildMarkdownArtifactID({
    sessionID: input.sessionID,
    messageID: input.messageID,
    partID: input.partID,
    segmentIndex: input.segmentIndex,
    sourceHash: preflight.sourceHash,
  })

  try {
    return await readMermaidV2Artifact(input.directory, artifactID)
  } catch (error) {
    if (!(error instanceof MermaidArtifactNotFoundError)) {
      throw error
    }
  }

  const manifest = MermaidArtifactManifestSchema.parse({
    version: 2,
    artifactID,
    kind: MERMAID_ARTIFACT_KIND,
    origin: {
      kind: "markdown",
      sessionID: input.sessionID,
      messageID: input.messageID,
      partID: input.partID,
      segmentIndex: input.segmentIndex,
    },
    diagramType: preflight.diagramType,
    alt: input.alt,
    ...(input.caption ? { caption: input.caption } : {}),
    sourceHash: preflight.sourceHash,
    preflightRepairs: preflight.repairs,
    autoRepair: defaultAutoRepairState(input.supersedesArtifactID),
    createdAt,
    updatedAt: createdAt,
    ...(input.supersedesArtifactID ? { supersedesArtifactID: input.supersedesArtifactID } : {}),
  })
  await Promise.all([
    writeArtifactManifest(input.directory, manifest),
    writeArtifactSource(input.directory, artifactID, preflight.source),
  ])
  return MermaidArtifactReadSchema.parse({
    ...manifest,
    source: preflight.source,
  })
}

async function readMermaidV2RenderRecord(
  directory: string,
  artifactID: string,
  renderKey: string,
): Promise<MermaidRenderRecord> {
  try {
    const record = await readJsonFile(
      MermaidArtifactPathV2.renderRecordFile(directory, artifactID, renderKey),
      MermaidRenderRecordSchema,
    )
    return sanitizeMermaidRenderRecord(record)
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new MermaidRenderRecordNotFoundError(renderKey)
    }
    throw error
  }
}

async function readMermaidV2Artifact(
  directory: string,
  artifactID: string,
  input?: { renderKey?: string },
): Promise<MermaidArtifactReadResult> {
  const safeArtifactID = MermaidArtifactPathV2.sanitizeArtifactID(artifactID)
  try {
    const [manifest, source, render] = await Promise.all([
      readArtifactManifest(directory, safeArtifactID),
      fs.readFile(MermaidArtifactPathV2.sourceFile(directory, safeArtifactID), "utf8"),
      input?.renderKey
        ? readMermaidV2RenderRecord(directory, safeArtifactID, input.renderKey).catch((error) => {
            if (error instanceof MermaidRenderRecordNotFoundError) {
              return undefined
            }
            throw error
          })
        : Promise.resolve(undefined),
    ])
    return MermaidArtifactReadSchema.parse({
      ...manifest,
      source,
      ...(render ? { render } : {}),
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new MermaidArtifactNotFoundError(safeArtifactID)
    }
    throw error
  }
}

async function listArtifactEntries(directory: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(MermaidArtifactPathV2.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }
}

async function listMermaidV2Artifacts(
  directory: string,
  input?: { includeSuperseded?: boolean },
): Promise<MermaidArtifactReadResult[]> {
  const entries = await listArtifactEntries(directory)
  const artifacts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "_repair-requests")
      .map(async (entry) => {
        try {
          return await readMermaidV2Artifact(directory, entry.name)
        } catch {
          return undefined
        }
      }),
  )
  const parsed = artifacts.filter((artifact): artifact is MermaidArtifactReadResult => !!artifact)
  if (input?.includeSuperseded) {
    return parsed.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
  const supersededArtifactIDs = new Set(
    parsed.flatMap((artifact) =>
      artifact.supersedesArtifactID ? [artifact.supersedesArtifactID] : [],
    ),
  )
  return parsed
    .filter((artifact) => !supersededArtifactIDs.has(artifact.artifactID))
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

async function resolveMermaidV2RenderRecord(
  directory: string,
  artifactID: string,
  input: ResolveMermaidRenderInput,
): Promise<MermaidResolvedRenderRecord> {
  const artifact = await readMermaidV2Artifact(directory, artifactID)
  const renderKey = buildRenderKey({
    sourceHash: artifact.sourceHash,
    rendererVersion: input.rendererVersion,
    renderConfigVersion: input.renderConfigVersion,
    themeSignature: input.themeSignature,
  })
  const render = await readMermaidV2RenderRecord(directory, artifact.artifactID, renderKey).catch(
    (error) => {
      if (error instanceof MermaidRenderRecordNotFoundError) {
        return undefined
      }
      throw error
    },
  )
  return MermaidResolvedRenderRecordSchema.parse({
    renderKey,
    ...(render ? { render } : {}),
  })
}

async function storeMermaidV2RenderRecord(
  directory: string,
  artifactID: string,
  input: StoreMermaidRenderRecordInput,
): Promise<MermaidRenderRecord> {
  const artifact = await readMermaidV2Artifact(directory, artifactID)
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
  await writeAtomicJson(
    MermaidArtifactPathV2.renderRecordFile(directory, artifact.artifactID, renderKey),
    record,
  )
  return record
}

async function markMermaidV2ArtifactSuperseded(
  directory: string,
  oldArtifactID: string,
  _replacementArtifactID: string,
): Promise<MermaidArtifactReadResult> {
  const artifact = await readMermaidV2Artifact(directory, oldArtifactID)
  const manifest = MermaidArtifactManifestSchema.parse({
    ...artifact,
    updatedAt: new Date().toISOString(),
  })
  await writeArtifactManifest(directory, manifest)
  return MermaidArtifactReadSchema.parse({
    ...manifest,
    source: artifact.source,
  })
}

async function updateMermaidV2AutoRepairState(
  directory: string,
  artifactID: string,
  state: MermaidAutoRepairState,
): Promise<MermaidArtifactReadResult> {
  const artifact = await readMermaidV2Artifact(directory, artifactID)
  const manifest = MermaidArtifactManifestSchema.parse({
    ...artifact,
    autoRepair: state,
    updatedAt: new Date().toISOString(),
  })
  await writeArtifactManifest(directory, manifest)
  return MermaidArtifactReadSchema.parse({
    ...manifest,
    source: artifact.source,
  })
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
  await writeAtomicJson(
    MermaidArtifactPathV2.repairRequestFile(input.directory, request.repairRequestID),
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
      MermaidArtifactPathV2.repairRequestFile(directory, repairRequestID),
      MermaidRepairRequestRecordSchema,
    )
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
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
  await writeAtomicJson(
    MermaidArtifactPathV2.repairRequestFile(directory, repairRequestID),
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
  buildMarkdownArtifactID,
  buildMermaidArtifactUrl,
  buildRenderKey,
  buildToolArtifactID,
  createMarkdownMermaidArtifact,
  createMermaidRepairRequest,
  createToolMermaidArtifact,
  isMermaidRepairExpired,
  listMermaidV2Artifacts,
  markMermaidV2ArtifactSuperseded,
  nextExhaustedAutoRepairState,
  readMermaidRepairRequest,
  readMermaidV2Artifact,
  readMermaidV2RenderRecord,
  resolveMermaidV2RenderRecord,
  storeMermaidV2RenderRecord,
  updateMermaidRepairRequest,
  updateMermaidV2AutoRepairState,
}

export type {
  CreateMarkdownMermaidArtifactInput,
  CreateToolMermaidArtifactInput,
  ResolveMermaidRenderInput,
  StoreMermaidRenderRecordInput,
}
