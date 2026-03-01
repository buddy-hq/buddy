export type SlashCommandSource = "command" | "mcp" | "skill"

export type SlashCommandOption = {
  type: "builtin" | "custom"
  name: string
  title?: string
  description?: string
  source?: SlashCommandSource
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

  if (name.startsWith(query)) return 0
  if (name.includes(query)) return 1
  if (title.startsWith(query)) return 2
  if (title.includes(query)) return 3
  return 4
}

export function filterSlashCommands(commands: SlashCommandOption[], query: string) {
  const normalized = query.trim().toLowerCase()

  return commands
    .filter((command) => {
      if (!normalized) return true
      if (command.name.toLowerCase().includes(normalized)) return true
      return command.title?.toLowerCase().includes(normalized) ?? false
    })
    .sort((left, right) => {
      const scoreDiff = slashScore(left, normalized) - slashScore(right, normalized)
      if (scoreDiff !== 0) return scoreDiff
      return left.name.localeCompare(right.name)
    })
}

export function parseSlashCommandInput(
  value: string,
  commands: Array<Pick<SlashCommandOption, "name">>,
) {
  if (!value.startsWith("/")) return undefined

  const [commandToken, ...argumentTokens] = value.split(" ")
  const commandName = commandToken.slice(1)
  if (!commandName) return undefined

  const command = commands.find((candidate) => candidate.name === commandName)
  if (!command) return undefined

  return {
    command,
    arguments: argumentTokens.join(" "),
  }
}
