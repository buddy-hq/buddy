import { LearnerMemorySchema, type LearnerMemory } from "./types"

const NONE_VALUE = "none"
const TRUE_VALUE = "true"
const YES_VALUE = "yes"
const HIGH_VALUE = "high"
const MEDIUM_VALUE = "medium"
const LOW_VALUE = "low"
const DEFAULT_CONFIDENCE = 0.5

const RETENTION_TYPE_ALIASES = new Map([
  ["learner_memory", "semantic"],
  ["memory", "semantic"],
])

const PEDAGOGY_TYPE_ALIASES = new Map([
  ["active_learning_area", "fragile_skill"],
  ["project_scoped_preference", "preference"],
])

const SOURCE_ALIASES = new Map([["candidate", "model_candidate"]])
const CANDIDATE_SOURCE_PREFIX = "cand_"

type InvalidLearnerMemoryBlock = {
  title: string
  markdown: string
  error: string
}

type LearnerMemoryRegistryParseResult = {
  memories: LearnerMemory[]
  invalidBlocks: InvalidLearnerMemoryBlock[]
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function markdownList(values: readonly string[]): string {
  if (values.length === 0) return "- None."
  return values.map((value) => `- ${normalizeLine(value)}`).join("\n")
}

function serializeList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : NONE_VALUE
}

function parseList(value: string | undefined): string[] {
  if (!value || value === NONE_VALUE) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseOptional(value: string | undefined): string | undefined {
  if (!value || value === NONE_VALUE) return undefined
  return value
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  if (value === HIGH_VALUE) return 0.85
  if (value === MEDIUM_VALUE) return 0.5
  if (value === LOW_VALUE) return 0.25
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBoolean(value: string | undefined): boolean {
  return value === TRUE_VALUE || value === YES_VALUE
}

function normalizeMetadataValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_")
}

function readAliasedMetadata(
  metadata: Map<string, string>,
  key: string,
  aliases: ReadonlyMap<string, string>,
): string | undefined {
  const value = metadata.get(key)
  const normalized = normalizeMetadataValue(value)
  if (!normalized) return undefined
  return aliases.get(normalized) ?? normalized
}

function readSourceMetadata(metadata: Map<string, string>): string {
  const value = metadata.get("source")
  const normalized = normalizeMetadataValue(value)
  if (!normalized) return "system"
  if (normalized.startsWith(CANDIDATE_SOURCE_PREFIX)) return "model_candidate"
  return SOURCE_ALIASES.get(normalized) ?? normalized
}

function parseMetadata(lines: readonly string[]): Map<string, string> {
  const metadata = new Map<string, string>()
  for (const line of lines) {
    const trimmed = line.trim()
    const candidate = trimmed.startsWith("- ") ? trimmed.slice(2).trim() : trimmed
    const separatorIndex = candidate.indexOf(":")
    if (separatorIndex < 0) continue
    metadata.set(
      candidate.slice(0, separatorIndex).trim(),
      candidate.slice(separatorIndex + 1).trim(),
    )
  }
  return metadata
}

function parseMemoryBlock(
  title: string,
  lines: readonly string[],
): { memory: LearnerMemory } | { error: string } {
  const metadata = parseMetadata(lines)
  const bodyStart = lines.findIndex((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith("- ")
  })
  const now = new Date().toISOString()
  const body = bodyStart >= 0 ? lines.slice(bodyStart).join("\n").trim() : title
  const parsed = LearnerMemorySchema.safeParse({
    id: metadata.get("id") ?? "",
    schemaVersion: 1,
    memoryType: readAliasedMetadata(metadata, "memoryType", RETENTION_TYPE_ALIASES),
    pedagogyKind: readAliasedMetadata(metadata, "pedagogyKind", PEDAGOGY_TYPE_ALIASES),
    type: readAliasedMetadata(metadata, "type", PEDAGOGY_TYPE_ALIASES),
    status: normalizeMetadataValue(metadata.get("status")),
    pinned: parseBoolean(metadata.get("pinned")),
    title,
    body,
    tags: parseList(metadata.get("tags")),
    ...(parseOptional(metadata.get("projectPath"))
      ? { projectPath: parseOptional(metadata.get("projectPath")) }
      : {}),
    confidence: parseNumber(normalizeMetadataValue(metadata.get("confidence")), DEFAULT_CONFIDENCE),
    strength: parseNumber(normalizeMetadataValue(metadata.get("strength")), DEFAULT_CONFIDENCE),
    ...(parseOptional(metadata.get("lastUsedAt"))
      ? { lastUsedAt: parseOptional(metadata.get("lastUsedAt")) }
      : {}),
    ...(parseOptional(metadata.get("supersededById"))
      ? { supersededById: parseOptional(metadata.get("supersededById")) }
      : {}),
    source: readSourceMetadata(metadata),
    sourceEventIds: parseList(metadata.get("sources")),
    createdAt: metadata.get("createdAt") ?? now,
    updatedAt: metadata.get("updatedAt") ?? now,
  })
  return parsed.success ? { memory: parsed.data } : { error: parsed.error.message }
}

function renderRawMemoryBlock(title: string, lines: readonly string[]): string {
  const body = lines.join("\n").trimEnd()
  return body.length > 0 ? `## ${title}\n${body}\n` : `## ${title}\n`
}

function parseLearnerMemoryRegistry(markdown: string): LearnerMemoryRegistryParseResult {
  const lines = markdown.split(/\r?\n/u)
  const memories: LearnerMemory[] = []
  const invalidBlocks: InvalidLearnerMemoryBlock[] = []
  let currentTitle: string | undefined
  let currentLines: string[] = []

  function flush(): void {
    if (!currentTitle) return
    const result = parseMemoryBlock(currentTitle, currentLines)
    if ("memory" in result) {
      memories.push(result.memory)
      return
    }
    invalidBlocks.push({
      title: currentTitle,
      markdown: renderRawMemoryBlock(currentTitle, currentLines),
      error: result.error,
    })
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush()
      currentTitle = line.slice(3).trim()
      currentLines = []
      continue
    }
    if (currentTitle) currentLines.push(line)
  }
  flush()

  return {
    memories: memories.toSorted((left, right) => left.id.localeCompare(right.id)),
    invalidBlocks,
  }
}

function parseLearnerMemoryRegistryMarkdown(markdown: string): LearnerMemory[] {
  return parseLearnerMemoryRegistry(markdown).memories
}

function renderSummaryMarkdown(memories: readonly LearnerMemory[]): string {
  const activeMemories = memories.filter(
    (memory) => memory.status === "active" || memory.status === "resolved",
  )
  const preferences = activeMemories
    .filter((memory) => memory.type === "preference")
    .map((memory) => `${memory.title}: ${memory.body}`)
  const goals = activeMemories
    .filter((memory) => memory.type === "goal" || memory.type === "open_loop")
    .map((memory) => `${memory.title}: ${memory.body}`)
  const fragile = activeMemories
    .filter((memory) => memory.type === "fragile_skill" || memory.type === "misconception")
    .map((memory) => `${memory.title}: ${memory.body}`)

  return `# Memory Summary

## Preferences

${markdownList(preferences)}

## Goals And Open Loops

${markdownList(goals)}

## Fragile Areas

${markdownList(fragile)}
`
}

function renderMemoryBlock(memory: LearnerMemory): string {
  return `## ${memory.title}

- id: ${memory.id}
- schemaVersion: ${memory.schemaVersion}
- memoryType: ${memory.memoryType}
- pedagogyKind: ${memory.pedagogyKind}
- type: ${memory.type}
- status: ${memory.status}
- pinned: ${memory.pinned ? "true" : "false"}
- confidence: ${memory.confidence.toFixed(2)}
- strength: ${memory.strength.toFixed(2)}
- tags: ${serializeList(memory.tags)}
- projectPath: ${memory.projectPath ?? NONE_VALUE}
- source: ${memory.source}
- sources: ${serializeList(memory.sourceEventIds)}
- createdAt: ${memory.createdAt}
- updatedAt: ${memory.updatedAt}
- lastUsedAt: ${memory.lastUsedAt ?? NONE_VALUE}
- supersededById: ${memory.supersededById ?? NONE_VALUE}

${normalizeLine(memory.body)}
`
}

function renderRegistryMarkdown(
  memories: readonly LearnerMemory[],
  options?: { invalidBlocks?: readonly InvalidLearnerMemoryBlock[] },
): string {
  const sorted = memories.toSorted((left, right) => {
    const statusOrder = left.status.localeCompare(right.status)
    if (statusOrder !== 0) return statusOrder
    return left.title.localeCompare(right.title)
  })
  const renderedMemories = sorted.map((memory) => renderMemoryBlock(memory))
  const preservedInvalidBlocks = (options?.invalidBlocks ?? []).map((block) =>
    block.markdown.trimEnd(),
  )
  const body = [...renderedMemories, ...preservedInvalidBlocks].join("\n")

  return `# Memory Registry

This file is the canonical memory store. Keep each memory as a parseable "##" block.

${body}
`
}

export {
  parseLearnerMemoryRegistry,
  parseLearnerMemoryRegistryMarkdown,
  renderRegistryMarkdown,
  renderSummaryMarkdown,
}

export type { InvalidLearnerMemoryBlock, LearnerMemoryRegistryParseResult }
