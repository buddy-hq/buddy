import { createBuddyPiResourceLoader } from "./host"
import { BUDDY_COMMANDS } from "./buddy-commands"

export type PiCommandInfo = {
  name: string
  description?: string | null
  agent?: string | null
}

export async function listPiCommands(directory: string): Promise<PiCommandInfo[]> {
  const { resourceLoader } = await createBuddyPiResourceLoader({ directory })
  const buddyCommands = Object.entries(BUDDY_COMMANDS).map(([name, command]) => ({
    name,
    description: command.description,
    agent: "buddy",
  }))
  const extensionCommands = resourceLoader.getExtensions().extensions.flatMap((extension) =>
    [...extension.commands.values()].map((command) => ({
      name: command.name,
      description: command.description ?? null,
      agent: "pi",
    })),
  )
  const promptCommands = resourceLoader.getPrompts().prompts.map((prompt) => ({
    name: prompt.name,
    description: prompt.description,
    agent: "pi",
  }))
  const skillCommands = resourceLoader.getSkills().skills.map((skill) => ({
    name: `skill:${skill.name}`,
    description: skill.description,
    agent: "pi",
  }))

  return [...buddyCommands, ...extensionCommands, ...promptCommands, ...skillCommands]
    .reduce<PiCommandInfo[]>((commands, command) => {
      if (commands.some((existing) => existing.name === command.name)) {
        return commands
      }
      commands.push(command)
      return commands
    }, [])
    .toSorted((left, right) => left.name.localeCompare(right.name))
}
