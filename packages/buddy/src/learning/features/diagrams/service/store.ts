import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectViewResponseSchema,
  BuddyObjectValidationError,
  MermaidObjectSummarySchema,
  generateObjectID,
  isNodeErrorCode,
  listObjects,
  readJsonFile,
  readObjectManifest,
  readObjectTextFile,
  registerBuddyObjectKind,
  writeObjectManifest,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectViewResponse,
} from "../../../../objects"
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
  MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX,
  MERMAID_AUTO_REPAIR_TIMEOUT_MS,
  MERMAID_RENDERER_NAME,
  MermaidAutoRepairStateSchema,
  MermaidPreflightRepairSchema,
  MermaidRenderContrastAdjustmentSchema,
  MermaidRepairRequestRecordSchema,
  MermaidSourceHashSchema,
  SHA256_HEX_PATTERN,
  type MermaidAutoRepairState,
  type MermaidPreflightRepair,
  type MermaidRenderContrastAdjustment,
  type MermaidRepairRequestRecord,
} from "./types"

type CreateMermaidObjectBaseInput = {
  directory: string
  alt: string
  caption?: string
  source: string
  createdAt?: string
  repairOfObjectID?: string
}

type CreateToolMermaidObjectInput = CreateMermaidObjectBaseInput & {
  sessionID: string
  messageID: string
  callID: string
  autoRepairRequestID?: string
  expectedSupersededRevisionID?: string
}

type CreateMarkdownMermaidObjectInput = CreateMermaidObjectBaseInput & {
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
}

type MermaidObjectReadResult = {
  objectID: string
  revisionID: string
  kind: typeof BUDDY_OBJECT_KINDS.mermaid
  origin: NonNullable<BuddyObjectManifest["origin"]>
  title: string
  diagramType: string
  alt: string
  caption?: string
  source: string
  sourceHash: string
  preflightRepairs: MermaidPreflightRepair[]
  autoRepair: MermaidAutoRepairState
  renderStatus: "ready" | "stale" | "error"
  repairOfObjectID: string | null
  supersedesRevisionID: string | null
  replacementRevisionID: string | null
  render?: MermaidObjectRenderRecord
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

const MERMAID_SOURCE_FILE_NAME = "source.mmd"
const MERMAID_PREFLIGHT_FILE_NAME = "preflight.json"
const MERMAID_AUTO_REPAIR_FILE_NAME = "auto-repair.json"
const MERMAID_RENDERS_DIRECTORY_NAME = "renders"
const MERMAID_REPAIR_REQUESTS_DIRECTORY_NAME = "repair-requests"
const MERMAID_RENDERED_VIEW_ID = "rendered" as const
const OBJECT_REVISIONS_DIRECTORY_NAME = "revisions"
const OBJECT_DERIVED_DIRECTORY_NAME = "derived"
const OBJECT_STATE_DIRECTORY_NAME = "state"
const OBJECT_KIND_INDEX_DIRECTORY_NAME = "_index"
const REPAIR_REQUEST_ID_PATTERN = new RegExp(
  `^${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}[A-Za-z0-9_-]+$`,
  "u",
)
const MARKDOWN_MERMAID_CREATION_QUEUE_SEPARATOR = "\u0000"

const MermaidObjectRenderRecordBaseSchema = z.object({
  renderKey: MermaidSourceHashSchema,
  objectID: BuddyObjectIDSchema,
  revisionID: BuddyObjectIDSchema,
  sourceHash: MermaidSourceHashSchema,
  rendererName: z.literal(MERMAID_RENDERER_NAME),
  rendererVersion: z.string().min(1),
  renderConfigVersion: z.number().int().nonnegative(),
  themeSignature: z.string().min(1),
  renderedAt: z.string().min(1),
})

const MermaidObjectRenderedRecordSchema = MermaidObjectRenderRecordBaseSchema.extend({
  status: z.literal("rendered"),
  svg: z.string().min(1),
  contrastAdjustments: z.array(MermaidRenderContrastAdjustmentSchema),
})

const MermaidObjectFailedRenderRecordSchema = MermaidObjectRenderRecordBaseSchema.extend({
  status: z.literal("failed"),
  errorMessage: z.string().min(1),
})

const MermaidObjectRenderRecordSchema = z.discriminatedUnion("status", [
  MermaidObjectRenderedRecordSchema,
  MermaidObjectFailedRenderRecordSchema,
])

const MermaidObjectResolvedRenderRecordSchema = z.object({
  renderKey: MermaidSourceHashSchema,
  render: MermaidObjectRenderRecordSchema.optional(),
})

type MermaidObjectSummary = ReturnType<typeof MermaidObjectSummarySchema.parse>
type MermaidObjectRenderRecord = z.infer<typeof MermaidObjectRenderRecordSchema>
type MermaidObjectResolvedRenderRecord = z.infer<typeof MermaidObjectResolvedRenderRecordSchema>

const markdownMermaidCreationQueues = new Map<string, Promise<void>>()

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

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

async function runMarkdownMermaidCreation<T>(
  input: {
    directory: string
    sessionID: string
    messageID: string
    partID: string
    segmentIndex: number
    sourceHash: string
  },
  operation: () => Promise<T>,
): Promise<T> {
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

function sanitizeMermaidObjectRenderRecord(
  record: MermaidObjectRenderRecord,
): MermaidObjectRenderRecord {
  if (record.status !== "rendered") return record

  return MermaidObjectRenderRecordSchema.parse({
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

function mermaidObjectSourcePath(revisionID: string): string {
  return path.join(OBJECT_REVISIONS_DIRECTORY_NAME, revisionID, MERMAID_SOURCE_FILE_NAME)
}

function mermaidObjectPreflightPath(revisionID: string): string {
  return path.join(OBJECT_REVISIONS_DIRECTORY_NAME, revisionID, MERMAID_PREFLIGHT_FILE_NAME)
}

function mermaidObjectAutoRepairPath(): string {
  return path.join(OBJECT_STATE_DIRECTORY_NAME, MERMAID_AUTO_REPAIR_FILE_NAME)
}

function mermaidObjectRenderRecordFile(input: {
  directory: string
  objectID: string
  revisionID: string
  renderKey: string
}): string {
  return BuddyObjectPath.objectFile(
    input.directory,
    BUDDY_OBJECT_KINDS.mermaid,
    input.objectID,
    path.join(
      OBJECT_DERIVED_DIRECTORY_NAME,
      MERMAID_RENDERS_DIRECTORY_NAME,
      input.revisionID,
      `${sanitizeRenderKey(input.renderKey)}.json`,
    ),
  )
}

function mermaidRepairRequestFile(directory: string, repairRequestID: string): string {
  return path.join(
    BuddyObjectPath.kindRoot(directory, BUDDY_OBJECT_KINDS.mermaid),
    OBJECT_KIND_INDEX_DIRECTORY_NAME,
    MERMAID_REPAIR_REQUESTS_DIRECTORY_NAME,
    `${sanitizeRepairRequestID(repairRequestID)}.json`,
  )
}

function defaultAutoRepairState(input: { isRepairRevision: boolean }): MermaidAutoRepairState {
  return MermaidAutoRepairStateSchema.parse(
    input.isRepairRevision
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

function toMermaidObjectRead(input: {
  manifest: BuddyObjectManifest & { summary: MermaidObjectSummary }
  revisionID: string
  source: string
  sourceHash: string
  preflightRepairs: MermaidPreflightRepair[]
  autoRepair: MermaidAutoRepairState
  render?: MermaidObjectRenderRecord
}): MermaidObjectReadResult {
  if (!input.manifest.origin) {
    throw new Error(`Mermaid object '${input.manifest.objectID}' has no origin.`)
  }
  return {
    objectID: input.manifest.objectID,
    revisionID: input.revisionID,
    kind: BUDDY_OBJECT_KINDS.mermaid,
    origin: input.manifest.origin,
    title: input.manifest.title,
    diagramType: input.manifest.summary.diagramType ?? "unknown",
    alt: input.manifest.summary.alt,
    ...(input.manifest.summary.caption ? { caption: input.manifest.summary.caption } : {}),
    source: input.source,
    sourceHash: input.sourceHash,
    preflightRepairs: input.preflightRepairs,
    autoRepair: input.autoRepair,
    renderStatus: input.manifest.summary.renderStatus,
    repairOfObjectID: input.manifest.summary.repairOfObjectID,
    supersedesRevisionID: input.manifest.summary.supersedesRevisionID,
    replacementRevisionID: input.manifest.summary.replacementRevisionID,
    ...(input.render ? { render: input.render } : {}),
  }
}

function buildMermaidObjectViews(input: { diagramType: string | null }): BuddyObjectManifest["views"] {
  return [
    {
      viewID: MERMAID_RENDERED_VIEW_ID,
      label: "Diagram",
      surfaces: ["inline", "bench", "library"],
      availability: { status: "available" },
      inline: {
        renderer: "mermaid",
        params: {
          renderer: "mermaid",
          diagramType: input.diagramType,
        },
      },
      bench: { resolver: "object-view" },
      library: { section: "diagrams" },
    },
  ]
}

async function createToolMermaidObject(
  input: CreateToolMermaidObjectInput,
): Promise<MermaidObjectReadResult> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const preflight = preflightMermaidSource(input.source)
  const objectID = input.repairOfObjectID
    ? BuddyObjectPath.sanitizeObjectID(input.repairOfObjectID)
    : generateObjectID()
  const revisionID = generateObjectID()
  const previousManifest = input.repairOfObjectID
    ? await readMermaidObjectManifest(input.directory, objectID)
    : undefined
  if (
    input.expectedSupersededRevisionID &&
    previousManifest?.currentRevisionID !== input.expectedSupersededRevisionID
  ) {
    throw new Error("Mermaid repair target revision changed before the repair could be committed.")
  }
  const supersedesRevisionID = previousManifest?.currentRevisionID ?? null
  const sourceRoot = BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.mermaid, objectID)
  const autoRepair = previousManifest
    ? await readMermaidObjectAutoRepairState({
        directory: input.directory,
        objectID,
      }).catch(() => defaultAutoRepairState({ isRepairRevision: true }))
    : defaultAutoRepairState({ isRepairRevision: false })
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: MermaidObjectSummarySchema,
  }).parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.mermaid,
    objectID,
    title: input.alt,
    ...(input.caption ? { description: input.caption } : {}),
    status: "ready",
    lifecycle: "revisioned",
    currentRevisionID: revisionID,
    origin: {
      kind: "tool",
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
    },
    createdAt: previousManifest?.createdAt ?? createdAt,
    updatedAt: createdAt,
    sourceRefs: [
      {
        role: "payload",
        path: path.posix.join(sourceRoot, mermaidObjectSourcePath(revisionID)),
        displayPath: path.posix.join(sourceRoot, mermaidObjectSourcePath(revisionID)),
        workspacePath: null,
        mutable: false,
        copied: false,
        availability: "available",
        exists: true,
        contentHash: preflight.sourceHash,
      },
    ],
    views: buildMermaidObjectViews({ diagramType: preflight.diagramType }),
    summary: {
      kind: BUDDY_OBJECT_KINDS.mermaid,
      alt: input.alt,
      caption: input.caption ?? null,
      diagramType: preflight.diagramType,
      renderStatus: "stale",
      repairOfObjectID: input.repairOfObjectID ?? null,
      supersedesRevisionID,
      replacementRevisionID: input.repairOfObjectID ? revisionID : null,
    },
  })
  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.mermaid,
    objectID,
    manifest,
    files: [
      {
        relativePath: mermaidObjectSourcePath(revisionID),
        format: "text",
        content: preflight.source,
      },
      {
        relativePath: mermaidObjectPreflightPath(revisionID),
        format: "json",
        content: {
          sourceHash: preflight.sourceHash,
          diagramType: preflight.diagramType,
          repairs: preflight.repairs,
        },
      },
      {
        relativePath: mermaidObjectAutoRepairPath(),
        format: "json",
        content: autoRepair,
      },
    ],
  })
  await markMatchingMermaidRepairRequestSucceeded({
    directory: input.directory,
    objectID,
    repairRequestID: input.autoRepairRequestID ?? input.messageID,
    supersededRevisionID: supersedesRevisionID,
    replacementRevisionID: revisionID,
  })
  return toMermaidObjectRead({
    manifest,
    revisionID,
    source: preflight.source,
    sourceHash: preflight.sourceHash,
    preflightRepairs: preflight.repairs,
    autoRepair: await readMermaidObjectAutoRepairState({
      directory: input.directory,
      objectID,
    }),
  })
}

async function createMarkdownMermaidObject(
  input: CreateMarkdownMermaidObjectInput,
): Promise<MermaidObjectReadResult> {
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
      const existing = await findMarkdownMermaidObject({
        directory: input.directory,
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
        segmentIndex: input.segmentIndex,
        sourceHash: preflight.sourceHash,
      })
      if (existing) return existing

      const objectID = generateObjectID()
      const revisionID = generateObjectID()
      const sourceRoot = BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.mermaid, objectID)
      const autoRepair = defaultAutoRepairState({ isRepairRevision: false })
      const manifest = BuddyObjectManifestSchema.safeExtend({
        summary: MermaidObjectSummarySchema,
      }).parse({
        version: 1,
        kind: BUDDY_OBJECT_KINDS.mermaid,
        objectID,
        title: input.alt,
        ...(input.caption ? { description: input.caption } : {}),
        status: "ready",
        lifecycle: "revisioned",
        currentRevisionID: revisionID,
        origin: {
          kind: "markdown",
          sessionID: input.sessionID,
          messageID: input.messageID,
          partID: input.partID,
          segmentIndex: input.segmentIndex,
        },
        createdAt,
        updatedAt: createdAt,
        sourceRefs: [
          {
            role: "payload",
            path: path.posix.join(sourceRoot, mermaidObjectSourcePath(revisionID)),
            displayPath: path.posix.join(sourceRoot, mermaidObjectSourcePath(revisionID)),
            workspacePath: null,
            mutable: false,
            copied: false,
            availability: "available",
            exists: true,
            contentHash: preflight.sourceHash,
          },
        ],
        views: buildMermaidObjectViews({ diagramType: preflight.diagramType }),
        summary: {
          kind: BUDDY_OBJECT_KINDS.mermaid,
          alt: input.alt,
          caption: input.caption ?? null,
          diagramType: preflight.diagramType,
          renderStatus: "stale",
          repairOfObjectID: input.repairOfObjectID ?? null,
          supersedesRevisionID: null,
          replacementRevisionID: null,
        },
      })
      await writeObjectRecord({
        directory: input.directory,
        kind: BUDDY_OBJECT_KINDS.mermaid,
        objectID,
        manifest,
        files: [
          {
            relativePath: mermaidObjectSourcePath(revisionID),
            format: "text",
            content: preflight.source,
          },
          {
            relativePath: mermaidObjectPreflightPath(revisionID),
            format: "json",
            content: {
              sourceHash: preflight.sourceHash,
              diagramType: preflight.diagramType,
              repairs: preflight.repairs,
            },
          },
          {
            relativePath: mermaidObjectAutoRepairPath(),
            format: "json",
            content: autoRepair,
          },
        ],
      })
      return toMermaidObjectRead({
        manifest,
        revisionID,
        source: preflight.source,
        sourceHash: preflight.sourceHash,
        preflightRepairs: preflight.repairs,
        autoRepair,
      })
    },
  )
}

async function findMarkdownMermaidObject(input: {
  directory: string
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  sourceHash: string
}): Promise<MermaidObjectReadResult | undefined> {
  const listed = await listObjects({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.mermaid,
  })
  for (const item of listed.objects) {
    const manifest = await readMermaidObjectManifest(input.directory, item.objectID).catch(
      () => undefined,
    )
    if (!manifest) continue
    const origin = manifest.origin
    if (
      origin?.kind !== "markdown" ||
      origin.sessionID !== input.sessionID ||
      origin.messageID !== input.messageID ||
      origin.partID !== input.partID ||
      origin.segmentIndex !== input.segmentIndex
    ) {
      continue
    }
    const preflight = await readMermaidObjectPreflight({
      directory: input.directory,
      objectID: manifest.objectID,
      revisionID: manifest.currentRevisionID,
    }).catch(() => undefined)
    if (preflight?.sourceHash !== input.sourceHash) {
      continue
    }
    return readMermaidObject({
      directory: input.directory,
      objectID: manifest.objectID,
    })
  }
  return undefined
}

async function readMermaidObjectManifest(
  directory: string,
  objectID: string,
): Promise<BuddyObjectManifest & { summary: MermaidObjectSummary }> {
  return BuddyObjectManifestSchema.safeExtend({
    summary: MermaidObjectSummarySchema,
  }).parse(await readObjectManifest({
    directory,
    kind: BUDDY_OBJECT_KINDS.mermaid,
    objectID,
  }))
}

async function readMermaidObjectPreflight(input: {
  directory: string
  objectID: string
  revisionID: string | undefined
}): Promise<{
  sourceHash: string
  diagramType: string
  repairs: MermaidPreflightRepair[]
}> {
  if (!input.revisionID) {
    throw new Error(`Mermaid object '${input.objectID}' has no current revision.`)
  }
  return readJsonFile(
    BuddyObjectPath.objectFile(
      input.directory,
      BUDDY_OBJECT_KINDS.mermaid,
      input.objectID,
      mermaidObjectPreflightPath(input.revisionID),
    ),
    z.object({
      sourceHash: MermaidSourceHashSchema,
      diagramType: z.string().min(1),
      repairs: z.array(MermaidPreflightRepairSchema),
    }),
  )
}

async function readMermaidObjectAutoRepairState(input: {
  directory: string
  objectID: string
}): Promise<MermaidAutoRepairState> {
  try {
    return await readJsonFile(
      BuddyObjectPath.objectFile(
        input.directory,
        BUDDY_OBJECT_KINDS.mermaid,
        input.objectID,
        mermaidObjectAutoRepairPath(),
      ),
      MermaidAutoRepairStateSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return defaultAutoRepairState({ isRepairRevision: false })
    }
    throw error
  }
}

async function updateMermaidObjectAutoRepairState(input: {
  directory: string
  objectID: string
  state: MermaidAutoRepairState
}): Promise<MermaidAutoRepairState> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  await writeJsonFileAtomic(
    BuddyObjectPath.objectFile(
      input.directory,
      BUDDY_OBJECT_KINDS.mermaid,
      objectID,
      mermaidObjectAutoRepairPath(),
    ),
    MermaidAutoRepairStateSchema.parse(input.state),
  )
  return input.state
}

async function readMermaidObjectRenderRecord(input: {
  directory: string
  objectID: string
  revisionID: string
  renderKey: string
}): Promise<MermaidObjectRenderRecord> {
  try {
    const record = await readJsonFile(
      mermaidObjectRenderRecordFile(input),
      MermaidObjectRenderRecordSchema,
    )
    return sanitizeMermaidObjectRenderRecord(record)
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new MermaidRenderRecordNotFoundError(input.renderKey)
    }
    throw error
  }
}

async function readMermaidObject(input: {
  directory: string
  objectID: string
  revisionID?: string | null
  renderKey?: string
}): Promise<MermaidObjectReadResult> {
  const manifest = await readMermaidObjectManifest(input.directory, input.objectID)
  const revisionID = input.revisionID ?? manifest.currentRevisionID
  if (!revisionID) {
    throw new Error(`Mermaid object '${input.objectID}' has no current revision.`)
  }
  const [source, preflight, autoRepair, render] = await Promise.all([
    readObjectTextFile({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.mermaid,
      objectID: input.objectID,
      relativePath: mermaidObjectSourcePath(revisionID),
    }),
    readMermaidObjectPreflight({
      directory: input.directory,
      objectID: input.objectID,
      revisionID,
    }),
    readMermaidObjectAutoRepairState({
      directory: input.directory,
      objectID: input.objectID,
    }),
    input.renderKey
      ? readMermaidObjectRenderRecord({
          directory: input.directory,
          objectID: input.objectID,
          revisionID,
          renderKey: input.renderKey,
        }).catch((error) => {
          if (error instanceof MermaidRenderRecordNotFoundError) {
            return undefined
          }
          throw error
        })
      : Promise.resolve(undefined),
  ])
  return toMermaidObjectRead({
    manifest,
    revisionID,
    source,
    sourceHash: preflight.sourceHash,
    preflightRepairs: preflight.repairs,
    autoRepair,
    ...(render ? { render } : {}),
  })
}

async function resolveMermaidObjectRenderRecord(
  directory: string,
  objectID: string,
  input: ResolveMermaidRenderInput & { revisionID?: string | null },
): Promise<MermaidObjectResolvedRenderRecord> {
  const object = await readMermaidObject({
    directory,
    objectID,
    revisionID: input.revisionID,
  })
  const renderKey = buildRenderKey({
    sourceHash: object.sourceHash,
    rendererVersion: input.rendererVersion,
    renderConfigVersion: input.renderConfigVersion,
    themeSignature: input.themeSignature,
  })
  const render = await readMermaidObjectRenderRecord({
    directory,
    objectID: object.objectID,
    revisionID: object.revisionID,
    renderKey,
  }).catch((error) => {
    if (error instanceof MermaidRenderRecordNotFoundError) {
      return undefined
    }
    throw error
  })
  return MermaidObjectResolvedRenderRecordSchema.parse({
    renderKey,
    ...(render ? { render } : {}),
  })
}

async function storeMermaidObjectRenderRecord(
  directory: string,
  objectID: string,
  input: StoreMermaidRenderRecordInput & { revisionID?: string | null },
): Promise<MermaidObjectRenderRecord> {
  const object = await readMermaidObject({
    directory,
    objectID,
    revisionID: input.revisionID,
  })
  const renderKey = buildRenderKey({
    sourceHash: object.sourceHash,
    rendererVersion: input.rendererVersion,
    renderConfigVersion: input.renderConfigVersion,
    themeSignature: input.themeSignature,
  })
  const renderedAt = new Date().toISOString()
  const record = MermaidObjectRenderRecordSchema.parse(
    input.status === "rendered"
      ? {
          renderKey,
          objectID: object.objectID,
          revisionID: object.revisionID,
          sourceHash: object.sourceHash,
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
          objectID: object.objectID,
          revisionID: object.revisionID,
          sourceHash: object.sourceHash,
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
    mermaidObjectRenderRecordFile({
      directory,
      objectID: object.objectID,
      revisionID: object.revisionID,
      renderKey,
    }),
    record,
  )
  const manifest = await readMermaidObjectManifest(directory, object.objectID)
  if (manifest.currentRevisionID !== object.revisionID) {
    return record
  }

  await writeObjectManifest({
    directory,
    manifest: BuddyObjectManifestSchema.safeExtend({
      summary: MermaidObjectSummarySchema,
    }).parse({
      ...manifest,
      updatedAt: renderedAt,
      summary: {
        ...manifest.summary,
        renderStatus: input.status === "rendered" ? "ready" : "error",
      },
    }),
  })
  return record
}

async function createMermaidRepairRequest(input: {
  directory: string
  sessionID: string
  objectID: string
  revisionID: string
  failedRenderKey: string
  createdAt?: string
}): Promise<MermaidRepairRequestRecord> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(createdAt) + MERMAID_AUTO_REPAIR_TIMEOUT_MS).toISOString()
  const repairRequestID = `${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}${randomUUID().replaceAll("-", "_")}`
  const request = MermaidRepairRequestRecordSchema.parse({
    repairRequestID,
    objectID: input.objectID,
    revisionID: input.revisionID,
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
    replacementRevisionID?: string
    lastErrorMessage?: string
  },
): Promise<MermaidRepairRequestRecord> {
  const current = await readMermaidRepairRequest(directory, repairRequestID)
  const updated = MermaidRepairRequestRecordSchema.parse({
    ...current,
    status: input.status,
    updatedAt: new Date().toISOString(),
    replacementRevisionID:
      input.status === "succeeded" ? input.replacementRevisionID : current.replacementRevisionID,
    lastErrorMessage:
      input.status === "exhausted" ? input.lastErrorMessage : current.lastErrorMessage,
  })
  await writeJsonFileAtomic(
    mermaidRepairRequestFile(directory, repairRequestID),
    updated,
  )
  return updated
}

async function markMatchingMermaidRepairRequestSucceeded(input: {
  directory: string
  objectID: string
  repairRequestID: string
  supersededRevisionID: string | null
  replacementRevisionID: string
}): Promise<void> {
  if (!input.repairRequestID.startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX)) {
    return
  }
  const request = await readMermaidRepairRequest(input.directory, input.repairRequestID).catch(
    (error) => {
      if (error instanceof MermaidRepairRequestNotFoundError) return undefined
      throw error
    },
  )
  if (
    !request ||
    request.objectID !== input.objectID ||
    request.revisionID !== input.supersededRevisionID ||
    request.status !== "running"
  ) {
    return
  }
  await updateMermaidRepairRequest(input.directory, request.repairRequestID, {
    status: "succeeded",
    replacementRevisionID: input.replacementRevisionID,
  })
  await updateMermaidObjectAutoRepairState({
    directory: input.directory,
    objectID: input.objectID,
    state: MermaidAutoRepairStateSchema.parse({
      status: "succeeded",
      attempts: MAX_MERMAID_AUTO_REPAIR_ATTEMPTS,
      replacementRevisionID: input.replacementRevisionID,
    }),
  })
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
  buildRenderKey,
  createMarkdownMermaidObject,
  createMermaidRepairRequest,
  createToolMermaidObject,
  isMermaidRepairExpired,
  MermaidObjectRenderRecordSchema,
  MermaidObjectResolvedRenderRecordSchema,
  nextExhaustedAutoRepairState,
  readMermaidObject,
  readMermaidObjectAutoRepairState,
  readMermaidObjectManifest,
  readMermaidObjectRenderRecord,
  readMermaidRepairRequest,
  resolveMermaidObjectRenderRecord,
  storeMermaidObjectRenderRecord,
  updateMermaidObjectAutoRepairState,
  updateMermaidRepairRequest,
}

export type {
  CreateMarkdownMermaidObjectInput,
  CreateToolMermaidObjectInput,
  MermaidObjectReadResult,
  MermaidObjectRenderRecord,
  MermaidObjectResolvedRenderRecord,
  ResolveMermaidRenderInput,
  StoreMermaidRenderRecordInput,
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.mermaid,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: MermaidObjectSummarySchema,
  }),
  async readManifest(input) {
    return readMermaidObjectManifest(input.directory, input.ref.objectID)
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== MERMAID_RENDERED_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported Mermaid view: ${input.viewID}`)
    }
    const object = await readMermaidObject({
      directory: input.directory,
      objectID: input.ref.objectID,
      revisionID: input.ref.revisionID,
    })
    return BuddyObjectViewResponseSchema.parse({
      ref: {
        kind: BUDDY_OBJECT_KINDS.mermaid,
        objectID: object.objectID,
        revisionID: object.revisionID,
        itemID: null,
      },
      viewID: MERMAID_RENDERED_VIEW_ID,
      title: object.title,
      data: {
        renderer: "mermaid",
        source: object.source,
        svgUrl: null,
        alt: object.alt,
        caption: object.caption ?? null,
        renderStatus: object.renderStatus,
        failedRenderKey: object.render?.status === "failed" ? object.render.renderKey : null,
      },
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== MERMAID_RENDERED_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_mermaid_view",
        message: `Unsupported Mermaid Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: MERMAID_RENDERED_VIEW_ID,
      },
    }
  },
})
