import { PROMPT_PART_TYPE_TEXT, type PromptComposerPart } from "./prompt-types"

export type SlashCommandSource = "command" | "mcp" | "skill"

export const COMPACT_SLASH_COMMAND_NAME = "compact" as const
export const COMPACT_SLASH_COMMAND_ALIASES = ["summarize"] as const
export const QUIZ_SLASH_COMMAND_NAME = "quiz" as const
export const UNDO_SLASH_COMMAND_NAME = "undo" as const
export const SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES = [
  "new",
  "mcp",
  UNDO_SLASH_COMMAND_NAME,
  COMPACT_SLASH_COMMAND_NAME,
  QUIZ_SLASH_COMMAND_NAME,
] as const

const QUIZ_PROMPT_PREFIX = "Create a quiz about " as const
const QUIZ_PROMPT_SUFFIX = ". Use the question-set-author subagent if it is available." as const
const DEFAULT_QUIZ_PROMPT =
  `Create a quiz based on the current conversation and context${QUIZ_PROMPT_SUFFIX}` as const

export type SlashCommandOption = {
  type: "builtin" | "custom"
  name: string
  title?: string
  description?: string
  source?: SlashCommandSource
  aliases?: string[]
}

export type SlashMatch = {
  start: number
  end: number
  query: string
}

export function getSlashMatch(value: string, cursorOffset: number): SlashMatch | undefined {
  if (!value.startsWith("/")) return undefined
  if (cursorOffset <= 0 || cursorOffset > value.length) return undefined
  if (/\s/.test(value)) return undefined

  const prefix = value.slice(0, cursorOffset)
  if (!prefix.startsWith("/") || /\s/.test(prefix)) return undefined

  return {
    start: 0,
    end: cursorOffset,
    query: prefix.slice(1),
  }
}

function slashScore(command: SlashCommandOption, query: string) {
  if (!query) return command.type === "custom" ? 0 : 1

  const name = command.name.toLowerCase()
  const title = command.title?.toLowerCase() ?? ""
  const aliases = command.aliases?.map((alias) => alias.toLowerCase()) ?? []

  if (name.startsWith(query)) return 0
  if (name.includes(query)) return 1
  if (aliases.some((alias) => alias.startsWith(query))) return 2
  if (aliases.some((alias) => alias.includes(query))) return 3
  if (title.startsWith(query)) return 4
  if (title.includes(query)) return 5
  return 6
}

export function filterSlashCommands(commands: SlashCommandOption[], query: string) {
  const normalized = query.trim().toLowerCase()

  return commands
    .filter((command) => {
      if (!normalized) return true
      if (command.name.toLowerCase().includes(normalized)) return true
      if (command.aliases?.some((alias) => alias.toLowerCase().includes(normalized))) return true
      return command.title?.toLowerCase().includes(normalized) ?? false
    })
    .toSorted((left, right) => {
      const scoreDiff = slashScore(left, normalized) - slashScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.name.localeCompare(right.name)
    })
}

export function parseSlashCommandInput(
  value: string,
  commands: Array<Pick<SlashCommandOption, "name" | "aliases">>,
) {
  if (!value.startsWith("/")) return undefined

  const [commandToken, ...argumentTokens] = value.split(" ")
  const commandName = commandToken.slice(1)
  if (!commandName) return undefined

  const command = commands.find((candidate) => {
    if (candidate.name === commandName) return true
    return candidate.aliases?.includes(commandName) ?? false
  })
  if (!command) return undefined

  return {
    command,
    arguments: argumentTokens.join(" "),
  }
}

export function buildQuizSlashPrompt(argumentsText: string) {
  const trimmedArguments = argumentsText.trim()
  if (!trimmedArguments) return DEFAULT_QUIZ_PROMPT

  return `${QUIZ_PROMPT_PREFIX}${trimmedArguments}${QUIZ_PROMPT_SUFFIX}`
}

function createTextPart(text: string): PromptComposerPart {
  return {
    type: PROMPT_PART_TYPE_TEXT,
    text,
  }
}

function trimLeadingSlashCommandPartText(text: string, commandName: string) {
  let nextText = text
  const commandPrefix = `/${commandName}`

  if (nextText.startsWith(commandPrefix)) {
    nextText = nextText.slice(commandPrefix.length)
  }

  return nextText.replace(/^\s+/, "")
}

export function buildQuizSlashPromptParts(
  promptParts: PromptComposerPart[],
  argumentsText: string,
): PromptComposerPart[] {
  const rewrittenArgumentParts: PromptComposerPart[] = []
  let trimmedLeadingCommand = false

  for (const part of promptParts) {
    if (part.type === PROMPT_PART_TYPE_TEXT && !trimmedLeadingCommand) {
      const trimmedText = trimLeadingSlashCommandPartText(part.text, QUIZ_SLASH_COMMAND_NAME)
      trimmedLeadingCommand = true
      if (trimmedText) {
        rewrittenArgumentParts.push(createTextPart(trimmedText))
      }
      continue
    }

    trimmedLeadingCommand = true
    rewrittenArgumentParts.push({ ...part })
  }

  if (rewrittenArgumentParts.length === 0) {
    return [createTextPart(buildQuizSlashPrompt(argumentsText))]
  }

  return [
    createTextPart(QUIZ_PROMPT_PREFIX),
    ...rewrittenArgumentParts,
    createTextPart(QUIZ_PROMPT_SUFFIX),
  ]
}
