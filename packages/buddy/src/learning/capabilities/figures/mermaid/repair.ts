import { normalizeMermaidSource } from "./normalize"

const MAX_REPAIR_PASSES = 3

const DIAGRAM_START_LINE =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture)\b/iu

const DIRECTIVE_LINE = /^%%\{.*\}%%$/u
const COMMENT_LINE = /^%%.*$/u

function trimBlankBoundaryLines(source: string): string {
  return source.replace(/^\s*\n+/u, "").replace(/\n+\s*$/u, "")
}

function isFenceLine(line: string): boolean {
  return /^(`{3,}|~{3,})\s*(?:mermaid)?\s*$/iu.test(line.trim())
}

function extractMermaidFenceFromProse(source: string, repairLog: string[]): string {
  const fencedMatches = [...source.matchAll(/(`{3,}|~{3,})\s*mermaid[^\n]*\n([\s\S]*?)\n\1/giu)]
  const first = fencedMatches[0]
  if (!first) {
    return source
  }

  const index = first.index ?? 0
  const fullMatch = first[0]
  const fencedSource = first[2] ?? ""
  const hasSurroundingProse =
    source.slice(0, index).trim().length > 0 ||
    source.slice(index + fullMatch.length).trim().length > 0

  if (!hasSurroundingProse && fencedMatches.length === 1) {
    return source
  }

  repairLog.push("Extracted Mermaid fenced block from wrapped prose.")
  return fencedSource
}

function stripSurroundingFence(source: string, repairLog: string[]): string {
  const wrappedMermaid = source.match(/^\s*(`{3,}|~{3,})\s*mermaid[^\n]*\n([\s\S]*?)\n\1\s*$/iu)
  if (wrappedMermaid?.[2]) {
    repairLog.push("Stripped surrounding Mermaid code fences.")
    return wrappedMermaid[2]
  }

  const wrappedGeneric = source.match(/^\s*(`{3,}|~{3,})\s*[^\n]*\n([\s\S]*?)\n\1\s*$/u)
  if (!wrappedGeneric?.[2]) {
    return source
  }

  repairLog.push("Stripped surrounding code fences.")
  return wrappedGeneric[2]
}

function removeFenceLines(source: string, repairLog: string[]): string {
  const lines = source.split("\n")
  const filtered = lines.filter((line) => !isFenceLine(line))

  if (filtered.length !== lines.length) {
    repairLog.push("Removed duplicate fence lines.")
  }

  return filtered.join("\n")
}

function removeDuplicateLeadingMermaidMarkers(source: string, repairLog: string[]): string {
  const lines = source.split("\n")
  let index = 0

  while (index < lines.length && lines[index]?.trim().toLowerCase() === "mermaid") {
    index += 1
  }

  if (index > 0) {
    repairLog.push("Removed duplicate leading Mermaid markers.")
    return lines.slice(index).join("\n")
  }

  return source
}

type SmartReplacement = {
  pattern: RegExp
  replacement: string
  log: string
}

const SMART_REPLACEMENTS: readonly SmartReplacement[] = [
  {
    pattern: /[“”„‟]/gu,
    replacement: '"',
    log: "Normalized smart double quotes.",
  },
  {
    pattern: /[‘’‚‛]/gu,
    replacement: "'",
    log: "Normalized smart single quotes.",
  },
  {
    pattern: /[–—―−]/gu,
    replacement: "-",
    log: "Normalized smart dashes.",
  },
  {
    pattern: /[→⇒➜➝➞➔]/gu,
    replacement: "-->",
    log: "Normalized unicode right-arrow glyphs.",
  },
  {
    pattern: /[←⇐]/gu,
    replacement: "<--",
    log: "Normalized unicode left-arrow glyphs.",
  },
  {
    pattern: /[↔⇔]/gu,
    replacement: "<-->",
    log: "Normalized unicode bidirectional-arrow glyphs.",
  },
]

function normalizeSmartPunctuation(source: string, repairLog: string[]): string {
  let next = source

  for (const replacement of SMART_REPLACEMENTS) {
    const updated = next.replace(replacement.pattern, replacement.replacement)
    if (updated !== next) {
      repairLog.push(replacement.log)
      next = updated
    }
  }

  return next
}

function findDiagramStartLine(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? ""
    if (!trimmed) {
      continue
    }
    if (DIAGRAM_START_LINE.test(trimmed)) {
      return index
    }
  }

  return -1
}

function isMermaidPrefixLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (COMMENT_LINE.test(trimmed)) return true
  if (DIRECTIVE_LINE.test(trimmed)) return true
  return false
}

function isLikelyMermaidLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (COMMENT_LINE.test(trimmed) || DIRECTIVE_LINE.test(trimmed)) return true
  if (DIAGRAM_START_LINE.test(trimmed)) return true
  if (
    /^(?:subgraph|end|style|class|classDef|click|state|note|participant|actor|title|section|task|dateFormat|axisFormat|tickInterval|accTitle|accDescr)\b/iu.test(
      trimmed,
    )
  ) {
    return true
  }
  if (/[-=<>:{}()[\]|;/\\]/u.test(trimmed)) {
    return true
  }
  return false
}

function trimProseOutsideDiagram(source: string, repairLog: string[]): string {
  const lines = source.split("\n")
  const diagramStartIndex = findDiagramStartLine(lines)
  if (diagramStartIndex === -1) {
    return source
  }

  let keepFrom = diagramStartIndex
  while (keepFrom > 0 && isMermaidPrefixLine(lines[keepFrom - 1] ?? "")) {
    keepFrom -= 1
  }

  let trimmed = lines
  if (keepFrom > 0) {
    trimmed = trimmed.slice(keepFrom)
    repairLog.push("Trimmed leading prose before the diagram block.")
  }

  let keepUntil = trimmed.length - 1
  while (keepUntil >= 0 && !isLikelyMermaidLine(trimmed[keepUntil] ?? "")) {
    keepUntil -= 1
  }

  if (keepUntil < trimmed.length - 1) {
    trimmed = trimmed.slice(0, Math.max(0, keepUntil + 1))
    repairLog.push("Trimmed trailing prose after the diagram block.")
  }

  return trimmed.join("\n")
}

type MermaidRepairPassResult = {
  source: string
  repairLog: string[]
}

function runMermaidRepairPass(source: string): MermaidRepairPassResult {
  const repairLog: string[] = []
  let repaired = normalizeMermaidSource(source)
  repaired = extractMermaidFenceFromProse(repaired, repairLog)
  repaired = stripSurroundingFence(repaired, repairLog)
  repaired = removeFenceLines(repaired, repairLog)
  repaired = removeDuplicateLeadingMermaidMarkers(repaired, repairLog)
  repaired = normalizeSmartPunctuation(repaired, repairLog)
  repaired = trimProseOutsideDiagram(repaired, repairLog)
  repaired = normalizeMermaidSource(trimBlankBoundaryLines(repaired))

  return {
    source: repaired,
    repairLog,
  }
}

export { MAX_REPAIR_PASSES, runMermaidRepairPass }

export type { MermaidRepairPassResult }
