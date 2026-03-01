export type MentionableAgent = {
  name: string
  description?: string
}

export type MentionableFile = {
  path: string
  description?: string
  recent?: boolean
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

export type MentionMatch = {
  start: number
  end: number
  query: string
}

export function getMentionMatch(value: string, cursorOffset: number): MentionMatch | undefined {
  if (cursorOffset <= 0 || cursorOffset > value.length) return undefined

  const prefix = value.slice(0, cursorOffset)
  const trigger = prefix.lastIndexOf("@")
  if (trigger === -1) return undefined

  const beforeTrigger = trigger === 0 ? undefined : prefix[trigger - 1]
  if (beforeTrigger !== undefined && !/\s/.test(beforeTrigger)) return undefined

  const query = prefix.slice(trigger + 1)
  if (/\s/.test(query)) return undefined

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
    .sort((left, right) => {
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
    .sort((left, right) => {
      const scoreDiff = fileMentionScore(left, normalized) - fileMentionScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.path.localeCompare(right.path)
    })
}

export function filterMentionOptions(
  agents: MentionableAgent[],
  files: MentionableFile[],
  query: string,
): MentionOption[] {
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

  return [...agentOptions, ...fileOptions]
}
