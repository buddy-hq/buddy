import { createHash } from "node:crypto"
import type { MermaidPreflightRepair, MermaidPreflightRepairCode } from "./v2-types"

const BYTE_ORDER_MARK = "\uFEFF"
const TAB_REPLACEMENT = "  "
const TRAILING_LINE_WHITESPACE_PATTERN = /[ \f\v]+$/gu
const COMMENT_LINE = /^%%.*$/u
const DIRECTIVE_LINE = /^%%\{.*\}%%$/u
const FLOWCHART_TYPES = new Set(["flowchart", "graph"])
const DIAGRAM_HEADER_ALIASES: Record<string, string> = {
  gitgraph: "gitGraph",
  "git-graph": "gitGraph",
  git_graph: "gitGraph",
  "quadrant-chart": "quadrantChart",
  quadrantchart: "quadrantChart",
  quadrant_chart: "quadrantChart",
}
const KNOWN_DIAGRAM_START_LINE =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture)\b/iu
const ER_RELATIONSHIP_LINE = /^(\s*[A-Za-z0-9_.-]+\s+\S+\s+[A-Za-z0-9_.-]+\s*:\s*)(.+\S)\s*$/u
const XYCHART_CONNECTOR_TRAILING_PATTERN = /\s+(?:-->|--|->>|->|==>|==|-.->|-.)\s*$/gu
const TIMELINE_NON_PERIOD_PREFIX = /^(?:title|section|accTitle|accDescr)\b/iu

type MermaidPreflightResult = {
  source: string
  sourceHash: string
  diagramType: string
  repairs: MermaidPreflightRepair[]
}

function hashMermaidSource(source: string): string {
  return createHash("sha256").update(source).digest("hex")
}

function normalizeMermaidSource(source: string): string {
  const withoutBom = source.replaceAll(BYTE_ORDER_MARK, "")
  const normalizedNewlines = withoutBom.replace(/\r\n?/gu, "\n")
  const normalizedTabs = normalizedNewlines.replace(/\t/gu, TAB_REPLACEMENT)

  return normalizedTabs
    .split("\n")
    .map((line) => line.replace(TRAILING_LINE_WHITESPACE_PATTERN, ""))
    .join("\n")
}

function trimBlankBoundaryLines(source: string): string {
  return source.replace(/^\s*\n+/u, "").replace(/\n+\s*$/u, "")
}

function inferMermaidDiagramType(source: string): string {
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || COMMENT_LINE.test(trimmed)) {
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

function readMermaidHeaderToken(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed || COMMENT_LINE.test(trimmed) || DIRECTIVE_LINE.test(trimmed)) {
    return undefined
  }
  const [token] = trimmed.split(/\s+/u)
  if (!token || token.toLowerCase() === "mermaid") {
    return undefined
  }
  return token
}

function appendRepair(
  repairs: MermaidPreflightRepair[],
  code: MermaidPreflightRepairCode,
  message: string,
): void {
  if (repairs.some((repair) => repair.code === code)) {
    return
  }
  repairs.push({ code, message })
}

function isFenceLine(line: string): boolean {
  return /^(`{3,}|~{3,})\s*(?:mermaid)?\s*$/iu.test(line.trim())
}

function extractWrappedMermaidFence(source: string, repairs: MermaidPreflightRepair[]): string {
  const matches = [
    ...source.matchAll(
      /(^|\n)( {0,3}(?:`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?\n[\s\S]*?\n {0,3}(?:`{3,}|~{3,})[ \t]*(?=\n|$))/giu,
    ),
  ]
  if (matches.length !== 1) {
    return source
  }
  const fullMatch = matches[0]?.[2]
  if (!fullMatch) {
    return source
  }
  const trimmedSource = source.trim()
  if (trimmedSource === fullMatch.trim()) {
    return source
  }
  appendRepair(
    repairs,
    "trimmed_wrapping_prose",
    "Trimmed wrapping prose around the Mermaid diagram.",
  )
  return fullMatch
}

function stripSurroundingFence(source: string, repairs: MermaidPreflightRepair[]): string {
  const wrapped = source.match(
    /^\s*( {0,3}(?:`{3,}|~{3,})\s*[^\n]*\n)([\s\S]*?)\n {0,3}(?:`{3,}|~{3,})\s*$/u,
  )
  if (!wrapped?.[2]) {
    return source
  }
  appendRepair(repairs, "stripped_fence", "Stripped surrounding Mermaid code fences.")
  return wrapped[2]
}

function removeDuplicateFenceLines(source: string, repairs: MermaidPreflightRepair[]): string {
  const lines = source.split("\n")
  const next = lines.filter((line) => !isFenceLine(line)).join("\n")
  if (next !== source) {
    appendRepair(repairs, "stripped_fence", "Stripped stray Mermaid fence lines.")
  }
  return next
}

function removeDuplicateLeadingMermaidMarkers(
  source: string,
  repairs: MermaidPreflightRepair[],
): string {
  const lines = source.split("\n")
  let index = 0
  while (lines[index]?.trim().toLowerCase() === "mermaid") {
    index += 1
  }
  if (index === 0) {
    return source
  }
  appendRepair(
    repairs,
    "removed_duplicate_mermaid_marker",
    "Removed duplicate leading Mermaid markers.",
  )
  return lines.slice(index).join("\n")
}

function canonicalizeDiagramHeaderAlias(source: string, repairs: MermaidPreflightRepair[]): string {
  const lines = source.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const trimmed = line.trim()
    if (!trimmed || COMMENT_LINE.test(trimmed) || DIRECTIVE_LINE.test(trimmed)) {
      continue
    }
    const [token] = trimmed.split(/\s+/u)
    if (!token) {
      return source
    }
    const canonical = DIAGRAM_HEADER_ALIASES[token.toLowerCase()]
    if (!canonical || canonical === token) {
      return source
    }
    const indentation = line.match(/^\s*/u)?.[0] ?? ""
    const remainder = trimmed.slice(token.length)
    lines[index] = `${indentation}${canonical}${remainder}`
    appendRepair(
      repairs,
      "canonicalized_header",
      `Canonicalized Mermaid diagram header '${token}' to '${canonical}'.`,
    )
    return lines.join("\n")
  }
  return source
}

function normalizeSmartPunctuation(source: string, repairs: MermaidPreflightRepair[]): string {
  const next = source
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[–—―−]/gu, "-")
  if (next !== source) {
    appendRepair(repairs, "normalized_smart_punctuation", "Normalized smart quotes and dashes.")
  }
  return next
}

function normalizeUnicodeArrows(source: string, repairs: MermaidPreflightRepair[]): string {
  const next = source
    .replace(/[→⇒➜➝➞➔]/gu, "-->")
    .replace(/[←⇐]/gu, "<--")
    .replace(/[↔⇔]/gu, "<-->")
  if (next !== source) {
    appendRepair(
      repairs,
      "normalized_unicode_arrow",
      "Normalized unicode arrow glyphs to Mermaid connectors.",
    )
  }
  return next
}

function quoteErRelationshipLabels(source: string, repairs: MermaidPreflightRepair[]): string {
  if (inferMermaidDiagramType(source).toLowerCase() !== "erdiagram") {
    return source
  }
  let changed = false
  const next = source
    .split("\n")
    .map((line) => {
      const match = line.match(ER_RELATIONSHIP_LINE)
      if (!match) {
        return line
      }
      const prefix = match[1] ?? ""
      const label = (match[2] ?? "").trim()
      if (!label || (label.startsWith('"') && label.endsWith('"'))) {
        return line
      }
      changed = true
      return `${prefix}"${label.replace(/^'+|'+$/gu, "")}"`
    })
    .join("\n")
  if (changed) {
    appendRepair(
      repairs,
      "quoted_er_relationship_label",
      "Quoted ER relationship labels after ':'.",
    )
  }
  return next
}

function convertFlowchartSingleQuotedLabels(
  source: string,
  repairs: MermaidPreflightRepair[],
): string {
  if (!FLOWCHART_TYPES.has(inferMermaidDiagramType(source).toLowerCase())) {
    return source
  }
  let changed = false
  let next = source.replace(/\|'([^'\n]+)'\|/gu, (_match, label: string) => {
    changed = true
    return `|"${label}"|`
  })
  next = next.replace(/(\[|\(|\{)'([^'\n]+)'(\]|\)|\})/gu, (_match, open, label, close) => {
    changed = true
    return `${String(open)}"${String(label)}"${String(close)}`
  })
  if (changed) {
    appendRepair(
      repairs,
      "converted_flowchart_single_quoted_label",
      "Converted single-quoted flowchart labels to double-quoted labels.",
    )
  }
  return next
}

function renameSubgraphNodeCollisions(source: string, repairs: MermaidPreflightRepair[]): string {
  if (!FLOWCHART_TYPES.has(inferMermaidDiagramType(source).toLowerCase())) {
    return source
  }

  const lines = source.split("\n")
  const subgraphIDs = new Set<string>()
  const lineNodeIDs = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("%%")) {
      continue
    }
    const subgraphMatch = trimmed.match(/^subgraph\s+([A-Za-z][\w-]*)\b/u)
    if (subgraphMatch?.[1]) {
      subgraphIDs.add(subgraphMatch[1])
      continue
    }
    const nodeMatch = trimmed.match(/^([A-Za-z][\w-]*)\s*(?:\[[^\]]*\]|\([^)]+\)|\{[^}]+\})/u)
    if (nodeMatch?.[1]) {
      lineNodeIDs.add(nodeMatch[1])
    }
  }

  const collisions = [...subgraphIDs].filter((id) => lineNodeIDs.has(id))
  if (collisions.length === 0) {
    return source
  }

  let next = lines.join("\n")
  let changed = false

  for (const collision of collisions) {
    const replacement = `${collision}_node`
    if (subgraphIDs.has(replacement) || lineNodeIDs.has(replacement)) {
      continue
    }
    next = next
      .split("\n")
      .map((line) => {
        const trimmed = line.trim()
        if (trimmed.match(new RegExp(`^subgraph\\s+${collision}\\b`, "u"))) {
          return line
        }
        const definitionPattern = new RegExp(
          `^(\\s*)${collision}(\\s*(?:\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\}))`,
          "u",
        )
        if (definitionPattern.test(line)) {
          changed = true
          return line.replace(definitionPattern, `$1${replacement}$2`)
        }
        const referencePattern = new RegExp(
          `(^|[^A-Za-z0-9_-])${collision}(?=[^A-Za-z0-9_-]|$)`,
          "gu",
        )
        const updated = line.replace(referencePattern, (_match, prefix: string) => {
          changed = true
          return `${prefix}${replacement}`
        })
        return updated
      })
      .join("\n")
  }

  if (changed) {
    appendRepair(
      repairs,
      "renamed_subgraph_node_collision",
      "Renamed colliding flowchart node ids that matched subgraph ids.",
    )
  }
  return next
}

function normalizeTimelinePeriods(source: string, repairs: MermaidPreflightRepair[]): string {
  if (inferMermaidDiagramType(source).toLowerCase() !== "timeline") {
    return source
  }
  let changed = false
  const next = source
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)(.+?)(\s+:\s+)(.+)$/u)
      if (!match) {
        return line
      }
      const [, indent, rawPeriod, separator, eventText] = match
      const period = rawPeriod.trim()
      if (!period || period.startsWith(":") || TIMELINE_NON_PERIOD_PREFIX.test(period)) {
        return line
      }
      let normalizedPeriod = period
      const quoted =
        (normalizedPeriod.startsWith('"') && normalizedPeriod.endsWith('"')) ||
        (normalizedPeriod.startsWith("'") && normalizedPeriod.endsWith("'"))
      if (quoted && normalizedPeriod.length > 1) {
        normalizedPeriod = normalizedPeriod.slice(1, -1)
      }
      if (normalizedPeriod.includes(":")) {
        normalizedPeriod = normalizedPeriod.replaceAll(":", ".")
      }
      if (normalizedPeriod === period) {
        return line
      }
      changed = true
      return `${indent}${normalizedPeriod}${separator}${eventText}`
    })
    .join("\n")
  if (changed) {
    appendRepair(repairs, "normalized_timeline_period", "Normalized timeline period labels.")
  }
  return next
}

function removeTrailingXychartConnectors(
  source: string,
  repairs: MermaidPreflightRepair[],
): string {
  if (inferMermaidDiagramType(source).toLowerCase() !== "xychart-beta") {
    return source
  }
  let changed = false
  const next = source
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      if (
        !trimmed.startsWith("x-axis") &&
        !trimmed.startsWith("y-axis") &&
        !trimmed.startsWith("title") &&
        !trimmed.startsWith("axis")
      ) {
        return line
      }
      const updated = line.replace(XYCHART_CONNECTOR_TRAILING_PATTERN, "")
      if (updated !== line) {
        changed = true
      }
      return updated
    })
    .join("\n")
  if (changed) {
    appendRepair(
      repairs,
      "removed_trailing_xychart_connector",
      "Removed trailing flowchart connectors from xychart lines.",
    )
  }
  return next
}

function findDiagramStartLine(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? ""
    if (!trimmed) {
      continue
    }
    if (KNOWN_DIAGRAM_START_LINE.test(trimmed)) {
      return index
    }
    const headerToken = readMermaidHeaderToken(trimmed)
    if (!headerToken) {
      continue
    }
    const diagramType = inferMermaidDiagramType(headerToken)
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? ""
      if (isMermaidPrefixLine(nextLine)) {
        continue
      }
      if (isLikelyMermaidLine(nextLine, diagramType)) {
        return index
      }
      break
    }
  }
  return -1
}

function isMermaidPrefixLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  return COMMENT_LINE.test(trimmed) || DIRECTIVE_LINE.test(trimmed)
}

function isLikelyMermaidLine(line: string, diagramType: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (COMMENT_LINE.test(trimmed) || DIRECTIVE_LINE.test(trimmed)) return true
  if (KNOWN_DIAGRAM_START_LINE.test(trimmed)) return true
  if (diagramType === "mindmap") {
    return true
  }
  if (diagramType === "gitGraph") {
    return /^(?:commit|branch|checkout|switch|merge|cherry-pick)\b/iu.test(trimmed)
  }
  if (/^\s{2,}\S/u.test(line)) {
    return true
  }
  if (
    /^(?:subgraph|end|style|class|classDef|click|state|note|participant|actor|title|section|task|dateFormat|axisFormat|tickInterval|accTitle|accDescr)\b/iu.test(
      trimmed,
    )
  ) {
    return true
  }
  return /[-=<>:{}()[\]|;/\\]/u.test(trimmed)
}

function trimProseOutsideDiagram(source: string, repairs: MermaidPreflightRepair[]): string {
  const lines = source.split("\n")
  const diagramStartIndex = findDiagramStartLine(lines)
  if (diagramStartIndex === -1) {
    return source
  }
  const diagramStartLine = lines[diagramStartIndex]?.trim() ?? ""
  const diagramType = inferMermaidDiagramType(diagramStartLine)
  let keepFrom = diagramStartIndex
  while (keepFrom > 0 && isMermaidPrefixLine(lines[keepFrom - 1] ?? "")) {
    keepFrom -= 1
  }
  let trimmed = lines
  let changed = false
  if (keepFrom > 0) {
    trimmed = trimmed.slice(keepFrom)
    changed = true
  }
  let keepUntil = trimmed.length - 1
  while (keepUntil >= 0 && !isLikelyMermaidLine(trimmed[keepUntil] ?? "", diagramType)) {
    keepUntil -= 1
  }
  if (keepUntil < trimmed.length - 1) {
    trimmed = trimmed.slice(0, Math.max(keepUntil + 1, 0))
    changed = true
  }
  if (changed) {
    appendRepair(
      repairs,
      "trimmed_wrapping_prose",
      "Trimmed surrounding prose outside the Mermaid diagram block.",
    )
  }
  return trimmed.join("\n")
}

function preflightMermaidSource(source: string): MermaidPreflightResult {
  const repairs: MermaidPreflightRepair[] = []
  let next = normalizeMermaidSource(source)
  next = extractWrappedMermaidFence(next, repairs)
  next = stripSurroundingFence(next, repairs)
  next = removeDuplicateFenceLines(next, repairs)
  next = removeDuplicateLeadingMermaidMarkers(next, repairs)
  next = canonicalizeDiagramHeaderAlias(next, repairs)
  next = normalizeSmartPunctuation(next, repairs)
  next = normalizeUnicodeArrows(next, repairs)
  next = quoteErRelationshipLabels(next, repairs)
  next = convertFlowchartSingleQuotedLabels(next, repairs)
  next = renameSubgraphNodeCollisions(next, repairs)
  next = normalizeTimelinePeriods(next, repairs)
  next = removeTrailingXychartConnectors(next, repairs)
  next = trimProseOutsideDiagram(next, repairs)
  next = normalizeMermaidSource(trimBlankBoundaryLines(next))
  return {
    source: next,
    sourceHash: hashMermaidSource(next),
    diagramType: inferMermaidDiagramType(next),
    repairs,
  }
}

export {
  hashMermaidSource,
  inferMermaidDiagramType,
  normalizeMermaidSource,
  preflightMermaidSource,
}

export type { MermaidPreflightResult }
