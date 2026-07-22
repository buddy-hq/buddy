import { PROMPT_STRUCTURED_MASK_CHAR } from "./prompt-types"

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

function fileMentionScore(file: MentionableFile, query: string) {
  const path = file.path.toLowerCase()
  if (!query) return file.recent ? 0 : 1
  if (path.startsWith(query)) return file.recent ? 0 : 1
  if (path.includes(`/${query}`)) return file.recent ? 1 : 2
  if (path.includes(query)) return file.recent ? 2 : 3
  return 4
}

export function filterMentionableFiles(files: MentionableFile[], query: string) {
  const normalized = query.trim().toLowerCase()

  return files
    .filter((file) => {
      if (!normalized) return true
      return file.path.toLowerCase().includes(normalized)
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
