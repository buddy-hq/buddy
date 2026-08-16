import { z } from "zod"
import type { ChemistryFormat } from "./formats"

const MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES = 1_000_000
type BrowserChemistryFormat = Exclude<ChemistryFormat, "chemfig">
const SINGLE_LINE_FORMATS: ReadonlySet<BrowserChemistryFormat> = new Set([
  "smiles",
  "cxsmiles",
  "reaction-smiles",
])
const CXSMILES_SGROUP_PATTERN = /(?:^|[|,])Sg:([^:,|]+)/gu
const SUPPORTED_CXSMILES_SGROUP_TYPES: ReadonlySet<string> = new Set(["gen", "n"])

export type IndigoSemanticFormat = "smiles" | "ket"

export type ValidatedChemistrySource = {
  format: BrowserChemistryFormat
  source: string
  sourceBytes: number
}

export class ChemistrySourceError extends Error {
  readonly code: "invalid_source" | "source_too_large"

  constructor(message: string, code: "invalid_source" | "source_too_large" = "invalid_source") {
    super(message)
    this.name = "ChemistrySourceError"
    this.code = code
  }
}

const ketNodeSchema = z.object({ $ref: z.string() })
const ketRootSchema = z.object({ nodes: z.array(ketNodeSchema) })
const ketDocumentSchema = z.object({ root: ketRootSchema }).passthrough()
const ketFragmentSchema = z.object({}).passthrough()

function requireSingleLine(format: BrowserChemistryFormat, source: string): void {
  if (!SINGLE_LINE_FORMATS.has(format) || !/[\r\n]/u.test(source)) {
    return
  }
  throw new ChemistrySourceError(`${format} notation must be provided on one line.`)
}

function validateReactionSmiles(source: string): void {
  const sections = source.split(">")
  if (sections.length !== 3 || !sections[0]?.trim() || !sections[2]?.trim()) {
    throw new ChemistrySourceError(
      "Reaction SMILES must use reactants>agents>products (the agents section may be empty).",
    )
  }
}

function validateKet(source: string): void {
  try {
    const parsed = ketDocumentSchema.safeParse(JSON.parse(source))
    if (!parsed.success) {
      throw new ChemistrySourceError('KET source must contain a "root.nodes" array.')
    }
    if (parsed.data.root.nodes.length === 0) {
      throw new ChemistrySourceError("KET source must contain at least one root node.")
    }
    const document = parsed.data
    const fragmentIDs = new Set(Object.keys(document))
    for (const node of document.root.nodes) {
      if (!fragmentIDs.has(node.$ref)) {
        throw new ChemistrySourceError(
          "Every KET root node must reference an object in the document.",
        )
      }
      const fragment = ketFragmentSchema.safeParse(
        Object.entries(document).find(([key]) => key === node.$ref)?.[1],
      )
      if (!fragment.success) {
        throw new ChemistrySourceError(
          "Every KET root node must reference an object in the document.",
        )
      }
    }
  } catch (error) {
    if (error instanceof ChemistrySourceError) throw error
    throw new ChemistrySourceError("KET source must be valid JSON.")
  }
}

function validateCxsmiles(source: string): void {
  for (const match of source.matchAll(CXSMILES_SGROUP_PATTERN)) {
    const sgroupType = match[1]
    if (sgroupType && !SUPPORTED_CXSMILES_SGROUP_TYPES.has(sgroupType)) {
      throw new ChemistrySourceError(
        `CXSMILES S-group type "${sgroupType}" is not supported by the bundled Indigo renderer. Supported S-group types are "n" (SRU) and "gen" (generic); use KET for other S-group types.`,
      )
    }
  }
}

export function indigoFormatForChemistry(format: BrowserChemistryFormat) {
  switch (format) {
    case "smiles":
    case "cxsmiles":
    case "reaction-smiles":
      return "smiles" satisfies IndigoSemanticFormat
    case "ket":
      return "ket" satisfies IndigoSemanticFormat
  }
}

export function validateChemistrySource(input: {
  format: BrowserChemistryFormat
  source: string
}): ValidatedChemistrySource {
  if (!input.source.trim()) {
    throw new ChemistrySourceError("Chemistry source is empty.")
  }

  const sourceBytes = new TextEncoder().encode(input.source).byteLength
  if (sourceBytes > MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES) {
    throw new ChemistrySourceError(
      "Chemistry source is too large to render safely.",
      "source_too_large",
    )
  }

  requireSingleLine(input.format, input.source)
  if (input.format === "smiles" && input.source.includes(">")) {
    throw new ChemistrySourceError("Use reaction-smiles for reaction notation.")
  }
  if (input.format === "reaction-smiles") {
    validateReactionSmiles(input.source)
  }
  if (input.format === "cxsmiles") {
    validateCxsmiles(input.source)
  }
  if (input.format === "ket") {
    validateKet(input.source)
  }

  return {
    format: input.format,
    source: input.source,
    sourceBytes,
  }
}

export { MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES }
