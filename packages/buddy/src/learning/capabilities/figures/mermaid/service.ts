import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { parse as parseMermaid } from "@mermaid-js/parser"
import { InvalidMermaidArtifactIDError, MermaidArtifactPath } from "./path"
import { MermaidArtifactManifestSchema, type MermaidArtifactManifest } from "./types"

type MermaidParserDiagramType =
  | "architecture"
  | "gitGraph"
  | "info"
  | "packet"
  | "pie"
  | "radar"
  | "treemap"

class MermaidArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Mermaid artifact '${artifactID}' was not found.`)
    this.name = "MermaidArtifactNotFoundError"
  }
}

class MermaidRenderError extends Error {
  readonly diagnostics: readonly string[]
  readonly repairAttempts: number
  readonly repairLog: readonly string[]

  constructor(input: {
    diagnostics: readonly string[]
    repairAttempts: number
    repairLog: string[]
  }) {
    super(input.diagnostics.join(" "))
    this.name = "MermaidRenderError"
    this.diagnostics = [...input.diagnostics]
    this.repairAttempts = input.repairAttempts
    this.repairLog = [...input.repairLog]
  }
}

type MermaidValidationResult =
  | {
      ok: true
    }
  | {
      ok: false
      diagnostics: string[]
    }

type MermaidArtifactReadResult = {
  artifactID: string
  kind: "mermaid.v1"
  diagramType: string
  alt: string
  caption?: string
  repairAttempts: number
  repairLog: string[]
  source: string
  createdAt: string
}

type MermaidArtifactListResult = MermaidArtifactReadResult[]

type MermaidArtifactIdentityInput = Omit<MermaidArtifactManifest, "artifactID" | "version">

const KNOWN_MERMAID_DIAGRAM_TYPES = new Set([
  "architecture",
  "architecture-beta",
  "block-beta",
  "c4component",
  "c4container",
  "c4context",
  "c4deployment",
  "c4dynamic",
  "classdiagram",
  "erdiagram",
  "flowchart",
  "gantt",
  "gitgraph",
  "graph",
  "info",
  "journey",
  "kanban",
  "mindmap",
  "packet",
  "packet-beta",
  "pie",
  "quadrantchart",
  "radar",
  "requirementdiagram",
  "sankey-beta",
  "sequencediagram",
  "statediagram",
  "statediagram-v2",
  "timeline",
  "treemap",
  "xychart-beta",
  "zenuml",
])

const INCOMPLETE_CONNECTOR_PATTERN = /(?:-->|--|==>|==|-.->|-.|<-->|<--|->>|->|<->|<=>|=>)\s*$/u

const DELIMITER_PAIRS = {
  "[": "]",
  "(": ")",
  "{": "}",
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeDiagramTypeToken(value: string): string {
  return value.trim().toLowerCase()
}

function toParserDiagramType(diagramType: string): MermaidParserDiagramType | undefined {
  const normalized = normalizeDiagramTypeToken(diagramType)
  switch (normalized) {
    case "architecture":
    case "architecture-beta":
      return "architecture"
    case "gitgraph":
      return "gitGraph"
    case "info":
      return "info"
    case "packet":
    case "packet-beta":
      return "packet"
    case "pie":
      return "pie"
    case "radar":
      return "radar"
    case "treemap":
      return "treemap"
    default:
      return undefined
  }
}

function nonCommentLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"))
}

const TIMELINE_NON_PERIOD_PREFIX = /^(?:title|section|accTitle|accDescr)\b/iu

function validateTimelinePeriodLabels(source: string): MermaidValidationResult {
  for (const line of nonCommentLines(source)) {
    const eventLine = line.match(/^(.+?)\s+:\s+(.+)$/u)
    if (!eventLine) {
      continue
    }

    const period = eventLine[1]?.trim() ?? ""
    if (period.length === 0 || period.startsWith(":")) {
      continue
    }
    if (TIMELINE_NON_PERIOD_PREFIX.test(period)) {
      continue
    }

    if (!period.includes(":")) {
      continue
    }

    return {
      ok: false,
      diagnostics: [`Timeline period labels cannot contain ':'. Invalid timeline line: '${line}'`],
    }
  }

  return { ok: true }
}

function validateBalancedDelimiters(source: string): MermaidValidationResult {
  let squareDepth = 0
  let roundDepth = 0
  let curlyDepth = 0

  for (const character of source) {
    switch (character) {
      case "[": {
        squareDepth += 1
        break
      }
      case "]": {
        squareDepth -= 1
        if (squareDepth < 0) {
          return {
            ok: false,
            diagnostics: [`Unbalanced Mermaid delimiters: unexpected '${character}'.`],
          }
        }
        break
      }
      case "(": {
        roundDepth += 1
        break
      }
      case ")": {
        roundDepth -= 1
        if (roundDepth < 0) {
          return {
            ok: false,
            diagnostics: [`Unbalanced Mermaid delimiters: unexpected '${character}'.`],
          }
        }
        break
      }
      case "{": {
        curlyDepth += 1
        break
      }
      case "}": {
        curlyDepth -= 1
        if (curlyDepth < 0) {
          return {
            ok: false,
            diagnostics: [`Unbalanced Mermaid delimiters: unexpected '${character}'.`],
          }
        }
        break
      }
      default:
        break
    }
  }

  const missing: string[] = []
  if (squareDepth > 0) {
    missing.push(DELIMITER_PAIRS["["].repeat(squareDepth))
  }
  if (roundDepth > 0) {
    missing.push(DELIMITER_PAIRS["("].repeat(roundDepth))
  }
  if (curlyDepth > 0) {
    missing.push(DELIMITER_PAIRS["{"].repeat(curlyDepth))
  }

  if (missing.length > 0) {
    return {
      ok: false,
      diagnostics: [`Unbalanced Mermaid delimiters: missing '${missing.join(" ")}'.`],
    }
  }

  return { ok: true }
}

function validateFallbackMermaidSource(
  source: string,
  diagramType: string,
): MermaidValidationResult {
  const normalizedType = normalizeDiagramTypeToken(diagramType)
  if (!KNOWN_MERMAID_DIAGRAM_TYPES.has(normalizedType)) {
    return {
      ok: false,
      diagnostics: [`Unknown Mermaid diagram type: ${diagramType}`],
    }
  }

  const lines = nonCommentLines(source)
  if (lines.length === 0) {
    return {
      ok: false,
      diagnostics: ["Mermaid source is empty."],
    }
  }

  const bodyLines = lines.slice(1)
  if (bodyLines.length === 0 && !/[-=<>:{}()[\]|]/u.test(lines[0] ?? "")) {
    return {
      ok: false,
      diagnostics: ["Mermaid diagram has no body content after the diagram header."],
    }
  }

  const incompleteLine = bodyLines.find((line) => INCOMPLETE_CONNECTOR_PATTERN.test(line))
  if (incompleteLine) {
    return {
      ok: false,
      diagnostics: [`Incomplete Mermaid connector expression: '${incompleteLine}'`],
    }
  }

  const delimiterValidation = validateBalancedDelimiters(source)
  if (!delimiterValidation.ok) {
    return delimiterValidation
  }

  if (normalizedType === "timeline") {
    return validateTimelinePeriodLabels(source)
  }

  return { ok: true }
}

function errorDiagnostics(error: unknown): string[] {
  const diagnostics: string[] = []

  if (error instanceof Error && error.message.trim()) {
    diagnostics.push(error.message.trim())
  } else if (typeof error === "string" && error.trim().length > 0) {
    diagnostics.push(error.trim())
  }

  if (isRecord(error)) {
    const message = error.message
    if (typeof message === "string" && message.trim().length > 0) {
      diagnostics.push(message.trim())
    }
  }

  const deduped = Array.from(new Set(diagnostics))
  if (deduped.length > 0) {
    return deduped
  }

  return ["Mermaid parser rejected the diagram source."]
}

async function validateSource(source: string): Promise<MermaidValidationResult> {
  const diagramType = inferDiagramType(source)
  const normalizedType = normalizeDiagramTypeToken(diagramType)
  if (!KNOWN_MERMAID_DIAGRAM_TYPES.has(normalizedType)) {
    return {
      ok: false,
      diagnostics: [`Unknown Mermaid diagram type: ${diagramType}`],
    }
  }

  const parserType = toParserDiagramType(diagramType)
  if (!parserType) {
    return validateFallbackMermaidSource(source, diagramType)
  }

  try {
    switch (parserType) {
      case "architecture":
        await parseMermaid("architecture", source)
        break
      case "gitGraph":
        await parseMermaid("gitGraph", source)
        break
      case "info":
        await parseMermaid("info", source)
        break
      case "packet":
        await parseMermaid("packet", source)
        break
      case "pie":
        await parseMermaid("pie", source)
        break
      case "radar":
        await parseMermaid("radar", source)
        break
      case "treemap":
        await parseMermaid("treemap", source)
        break
      default: {
        const unreachable: never = parserType
        throw new Error(`Unsupported Mermaid parser type: ${String(unreachable)}`)
      }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      diagnostics: errorDiagnostics(error),
    }
  }
}

function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex")
}

function hashArtifact(input: MermaidArtifactIdentityInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function buildArtifactUrl(directory: string, artifactID: string): string {
  return `/api/mermaid-artifacts/${artifactID}?directory=${encodeURIComponent(directory)}`
}

function buildMarkdown(source: string): string {
  return ["```mermaid", source, "```"].join("\n")
}

function inferDiagramType(source: string): string {
  const lines = source.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%%")) {
      continue
    }

    const [token] = trimmed.split(/\s+/u)
    if (!token) {
      continue
    }

    if (token.toLowerCase() === "graph") {
      return "flowchart"
    }

    return token
  }

  return "unknown"
}

async function write(input: {
  directory: string
  manifest: MermaidArtifactManifest
  source: string
}): Promise<void> {
  const targetDirectory = MermaidArtifactPath.artifactDirectory(
    input.directory,
    input.manifest.artifactID,
  )
  await fs.mkdir(targetDirectory, { recursive: true })
  await Promise.all([
    fs.writeFile(
      MermaidArtifactPath.manifestFile(input.directory, input.manifest.artifactID),
      `${JSON.stringify(input.manifest, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      MermaidArtifactPath.diagramFile(input.directory, input.manifest.artifactID),
      input.source,
      "utf8",
    ),
  ])
}

async function read(directory: string, artifactID: string): Promise<MermaidArtifactReadResult> {
  const safeArtifactID = MermaidArtifactPath.sanitizeArtifactID(artifactID)

  try {
    const [manifestText, source] = await Promise.all([
      fs.readFile(MermaidArtifactPath.manifestFile(directory, safeArtifactID), "utf8"),
      fs.readFile(MermaidArtifactPath.diagramFile(directory, safeArtifactID), "utf8"),
    ])

    const parsedManifest = MermaidArtifactManifestSchema.parse(JSON.parse(manifestText) as unknown)

    return {
      artifactID: parsedManifest.artifactID,
      kind: parsedManifest.kind,
      diagramType: parsedManifest.diagramType,
      alt: parsedManifest.alt,
      ...(parsedManifest.caption ? { caption: parsedManifest.caption } : {}),
      repairAttempts: parsedManifest.repairAttempts,
      repairLog: [...parsedManifest.repairLog],
      source,
      createdAt: parsedManifest.createdAt,
    }
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new MermaidArtifactNotFoundError(safeArtifactID)
    }
    throw error
  }
}

async function list(directory: string): Promise<MermaidArtifactListResult> {
  let entries: Dirent[] = []

  try {
    entries = await fs.readdir(MermaidArtifactPath.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }

  const artifacts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await read(directory, entry.name)
        } catch {
          return undefined
        }
      }),
  )

  return artifacts
    .filter((artifact): artifact is MermaidArtifactReadResult => artifact !== undefined)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function mapMermaidArtifactRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidMermaidArtifactIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof MermaidArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof MermaidRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

const MermaidArtifactService = {
  buildArtifactUrl,
  buildMarkdown,
  hashArtifact,
  hashSource,
  inferDiagramType,
  list,
  read,
  validateSource,
  write,
}

export {
  MermaidArtifactNotFoundError,
  MermaidArtifactService,
  MermaidRenderError,
  mapMermaidArtifactRouteError,
}

export type { MermaidArtifactListResult, MermaidArtifactReadResult, MermaidValidationResult }
