export const RESOURCE_SIDEBAR_TAB = 'resources' as const
export const RESOURCE_COMMAND_ROOT = 'resource' as const
export const RESOURCE_COMMAND_PANEL = 'resources' as const
export const RESOURCE_COMMAND_ADD = 'add' as const
export const RESOURCE_COMMAND_REBUILD = 'rebuild' as const
export const RESOURCE_COMMAND_REMOVE = 'remove' as const
export const RESOURCE_COMMAND_USE = 'use' as const
export const RESOURCE_COMMAND_ALIAS_KEYWORD = 'as' as const

export const RESOURCE_LOCAL_SLASH_COMMANDS = [
  {
    type: 'builtin' as const,
    name: RESOURCE_COMMAND_PANEL,
    title: 'Open resources panel',
    description: 'Show notebook resources in the right sidebar.',
  },
  {
    type: 'builtin' as const,
    name: RESOURCE_COMMAND_ROOT,
    title: 'Manage resources',
    description: 'Add, rebuild, remove, or use notebook resources.',
  },
]

export type ResourceLocalSlashCommand =
  | {
      type: typeof RESOURCE_COMMAND_PANEL
    }
  | {
      type: typeof RESOURCE_COMMAND_ADD
      path: string
      alias?: string
    }
  | {
      type: typeof RESOURCE_COMMAND_REBUILD
      key: string
    }
  | {
      type: typeof RESOURCE_COMMAND_REMOVE
      key: string
    }
  | {
      type: typeof RESOURCE_COMMAND_USE
      key: string
      prompt?: string
    }

function normalizeSlashCommandInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return undefined
  return trimmed.slice(1).trim()
}

function splitCommandBody(value: string) {
  const body = value.trim()
  if (!body) return undefined

  const spaceIndex = body.indexOf(' ')
  if (spaceIndex === -1) {
    return {
      command: body,
      rest: '',
    }
  }

  return {
    command: body.slice(0, spaceIndex),
    rest: body.slice(spaceIndex + 1).trimStart(),
  }
}

function parseAddCommand(rest: string) {
  const aliasDelimiter = ` ${RESOURCE_COMMAND_ALIAS_KEYWORD} `
  const aliasIndex = rest.lastIndexOf(aliasDelimiter)
  if (aliasIndex > 0) {
    const path = rest.slice(0, aliasIndex).trim()
    const alias = rest.slice(aliasIndex + aliasDelimiter.length).trim()
    if (!path || !alias) return undefined
    return {
      type: RESOURCE_COMMAND_ADD,
      path,
      alias,
    } satisfies ResourceLocalSlashCommand
  }

  const path = rest.trim()
  if (!path) return undefined

  return {
    type: RESOURCE_COMMAND_ADD,
    path,
  } satisfies ResourceLocalSlashCommand
}

export function isResourceLocalSlashCommandName(name: string) {
  return name === RESOURCE_COMMAND_PANEL || name === RESOURCE_COMMAND_ROOT
}

export function parseResourceLocalSlashCommand(
  value: string,
): ResourceLocalSlashCommand | undefined {
  const normalized = normalizeSlashCommandInput(value)
  if (!normalized) return undefined

  const command = splitCommandBody(normalized)
  if (!command) return undefined

  if (command.command === RESOURCE_COMMAND_PANEL) {
    return {
      type: RESOURCE_COMMAND_PANEL,
    }
  }

  if (command.command !== RESOURCE_COMMAND_ROOT) return undefined

  const subcommand = splitCommandBody(command.rest)
  if (!subcommand) return undefined

  if (subcommand.command === RESOURCE_COMMAND_ADD) {
    return parseAddCommand(subcommand.rest)
  }

  if (subcommand.command === RESOURCE_COMMAND_REBUILD) {
    const key = subcommand.rest.trim()
    if (!key) return undefined
    return {
      type: RESOURCE_COMMAND_REBUILD,
      key,
    }
  }

  if (subcommand.command === RESOURCE_COMMAND_REMOVE) {
    const key = subcommand.rest.trim()
    if (!key) return undefined
    return {
      type: RESOURCE_COMMAND_REMOVE,
      key,
    }
  }

  if (subcommand.command === RESOURCE_COMMAND_USE) {
    const useArgs = splitCommandBody(subcommand.rest)
    if (!useArgs) return undefined
    const key = useArgs.command.trim()
    if (!key) return undefined
    const prompt = useArgs.rest.trimStart()
    return prompt.length > 0
      ? {
          type: RESOURCE_COMMAND_USE,
          key,
          prompt,
        }
      : {
          type: RESOURCE_COMMAND_USE,
          key,
        }
  }

  return undefined
}
