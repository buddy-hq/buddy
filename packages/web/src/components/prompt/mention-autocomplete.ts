import { PROMPT_STRUCTURED_MASK_CHAR } from "./prompt-types"
import type { NotebookSearchResult } from "@/state/notebook-search"

export type MentionableAgent = {
  name: string
  description?: string
}

export type MentionableFile = {
  path: string
  description?: string
  recent?: boolean
}

export type MentionableReference = {
  name: string
  path: string
  description?: string
}

export type MentionOption =
  | { type: "notebook"; result: NotebookSearchResult }
  | {
      type: "agent"
      name: string
      description?: string
    }
  | {
      type: "file"
      path: string
      description?: string
      recent?: boolean
    }
  | {
      type: "reference"
      name: string
      path: string
      description?: string
    }

/** Identifies a row across renders, so late results never move the highlight to another row. */
export function mentionOptionIdentity(option: MentionOption): string {
  switch (option.type) {
    case "notebook":
      return `notebook:${option.result.id}`
    case "agent":
      return `agent:${option.name}`
    case "file":
      return `file:${option.path}`
    case "reference":
      return `reference:${option.name}:${option.path}`
  }
}

export type MentionMatch = {
  start: number
  end: number
  query: string
}

// Whitespace or a masked pill character ends a trigger query.
const QUERY_BREAK_PATTERN = new RegExp(`[\\s${PROMPT_STRUCTURED_MASK_CHAR}]`)

// Mirrors opencode's trigger rule (`/@(\S*)$/` on the text before the cursor):
// typing `@` opens the menu wherever it happens — after an abandoned "/quer",
// mid-word, anywhere — as long as no whitespace separates the `@` from the
// cursor. Pill text is masked out of `value` upstream, so an `@` inside a
// pill's serialized path can never produce a match.
export function getMentionMatch(value: string, cursorOffset: number): MentionMatch | undefined {
  if (cursorOffset <= 0 || cursorOffset > value.length) return undefined

  const prefix = value.slice(0, cursorOffset)
  const trigger = prefix.lastIndexOf("@")
  if (trigger === -1) return undefined

  const query = prefix.slice(trigger + 1)
  if (QUERY_BREAK_PATTERN.test(query)) return undefined

  return {
    start: trigger,
    end: cursorOffset,
    query,
  }
}

function mentionScore(agent: MentionableAgent, query: string) {
  if (!query) return 2

  const name = agent.name.toLowerCase()
  if (name.startsWith(query)) return 0
  if (name.includes(query)) return 1
  return 3
}

export function filterMentionableAgents(agents: MentionableAgent[], query: string) {
  const normalized = query.trim().toLowerCase()

  return agents
    .filter((agent) => {
      if (!normalized) return true
      return agent.name.toLowerCase().includes(normalized)
    })
    .toSorted((left, right) => {
      const scoreDiff = mentionScore(left, normalized) - mentionScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.name.localeCompare(right.name)
    })
}

// Folder and recent paths can be stored decomposed (macOS), while typed queries arrive composed.
function normalizeFileMentionText(text: string) {
  return text.normalize("NFC").toLowerCase()
}

function fileMentionScore(file: MentionableFile, query: string) {
  const path = normalizeFileMentionText(file.path)
  if (!query) return file.recent ? 0 : 1
  if (path.startsWith(query)) return file.recent ? 0 : 1
  if (path.includes(`/${query}`)) return file.recent ? 1 : 2
  if (path.includes(query)) return file.recent ? 2 : 3
  return 4
}

export function isFolderPrefixMention(option: MentionOption, query: string) {
  const normalized = normalizeFileMentionText(query.trim())
  return (
    option.type === "file" &&
    option.path.endsWith("/") &&
    normalized.length > 0 &&
    normalizeFileMentionText(option.path).startsWith(normalized)
  )
}

export function filterMentionableFiles(files: MentionableFile[], query: string) {
  const normalized = normalizeFileMentionText(query.trim())

  return files
    .filter((file) => {
      if (!normalized) return true
      return normalizeFileMentionText(file.path).includes(normalized)
    })
    .toSorted((left, right) => {
      const scoreDiff = fileMentionScore(left, normalized) - fileMentionScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.path.localeCompare(right.path)
    })
}

export function filterMentionableReferences(references: MentionableReference[], query: string) {
  const normalized = query.trim().toLowerCase()

  return references
    .filter((reference) => {
      if (!normalized) return true
      return reference.name.toLowerCase().includes(normalized)
    })
    .toSorted((left, right) => {
      const scoreDiff = mentionScore(left, normalized) - mentionScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.name.localeCompare(right.name)
    })
}

export function filterMentionOptions(
  references: MentionableReference[],
  agents: MentionableAgent[],
  files: MentionableFile[],
  query: string,
): MentionOption[] {
  const referenceOptions = filterMentionableReferences(references, query).map(
    (reference): MentionOption => ({
      type: "reference",
      name: reference.name,
      path: reference.path,
      description: reference.description,
    }),
  )
  const agentOptions = filterMentionableAgents(agents, query).map(
    (agent): MentionOption => ({
      type: "agent",
      name: agent.name,
      description: agent.description,
    }),
  )
  const fileOptions = filterMentionableFiles(files, query).map(
    (file): MentionOption => ({
      type: "file",
      path: file.path,
      description: file.description,
      recent: file.recent,
    }),
  )

  return [...referenceOptions, ...agentOptions, ...fileOptions]
}
