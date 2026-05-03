import { parse as parseMermaid } from "@mermaid-js/parser"

type MermaidParserDiagramType =
  | "architecture"
  | "gitGraph"
  | "info"
  | "packet"
  | "pie"
  | "radar"
  | "treemap"

type MermaidValidationResult =
  | {
      ok: true
    }
  | {
      ok: false
      diagnostics: string[]
    }

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

const FLOWCHART_DIAGRAM_TYPES = new Set(["flowchart", "graph"])

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

    const isQuoted =
      (period.startsWith('"') && period.endsWith('"') && period.length > 1) ||
      (period.startsWith("'") && period.endsWith("'") && period.length > 1)
    if (isQuoted) {
      return {
        ok: false,
        diagnostics: [`Timeline period labels cannot be quoted. Invalid timeline line: '${line}'`],
      }
    }

    if (period.includes(":")) {
      return {
        ok: false,
        diagnostics: [
          `Timeline period labels cannot contain ':'. Invalid timeline line: '${line}'`,
        ],
      }
    }
  }

  return { ok: true }
}

function validateFlowchartEdgeLabelQuotes(source: string): MermaidValidationResult {
  for (const line of nonCommentLines(source)) {
    const quotedEdgeLabel = line.match(/\|([^|\n]*"[^|\n]*)\|/u)
    if (!quotedEdgeLabel) {
      continue
    }

    return {
      ok: false,
      diagnostics: [`Flowchart edge labels cannot contain '"'. Invalid flowchart line: '${line}'`],
    }
  }

  return { ok: true }
}

function validateFlowchartNodeLabelQuotes(source: string): MermaidValidationResult {
  const NODE_LABEL_WITH_STRAY_QUOTE = /(?:\[|\(|\{)([^\])}{\n]*"[^\])}{\n]*)(?:\]|\)|\})/u

  for (const line of nonCommentLines(source)) {
    if (/^(?:subgraph|end|style|classDef|class|click|direction)\b/iu.test(line)) {
      continue
    }
    const match = line.match(NODE_LABEL_WITH_STRAY_QUOTE)
    if (!match) {
      continue
    }
    const content = match[1] ?? ""
    const trimmed = content.trim()
    if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      continue
    }
    return {
      ok: false,
      diagnostics: [
        `Flowchart node labels cannot contain unquoted '"'. Invalid flowchart line: '${line}'`,
      ],
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

  const ER_DIAGRAM_TYPES = new Set(["erdiagram"])
  const skipBalancedDelimiters = ER_DIAGRAM_TYPES.has(normalizedType)

  if (!skipBalancedDelimiters) {
    const delimiterValidation = validateBalancedDelimiters(source)
    if (!delimiterValidation.ok) {
      return delimiterValidation
    }
  }

  if (FLOWCHART_DIAGRAM_TYPES.has(normalizedType)) {
    const edgeLabelResult = validateFlowchartEdgeLabelQuotes(source)
    if (!edgeLabelResult.ok) {
      return edgeLabelResult
    }
    return validateFlowchartNodeLabelQuotes(source)
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

async function validateMermaidSource(source: string): Promise<MermaidValidationResult> {
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

export { validateMermaidSource }
