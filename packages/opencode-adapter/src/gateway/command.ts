import type { OpenCodeClient } from "@opencode/client"

export const hiddenRuntimeCommandNames = new Set(["init"])

export async function listExecutableCommands(
  client: Pick<OpenCodeClient, "command" | "skill">,
  directory: string,
) {
  const location = { directory }
  const [commands, skills] = await Promise.all([
    client.command.list({ location }),
    client.skill.list({ location }),
  ])
  const visibleCommands = commands.data.filter(
    (command) => !hiddenRuntimeCommandNames.has(command.name),
  )
  const names = new Set(visibleCommands.map((command) => command.name))
  return [
    ...visibleCommands.map((command) => ({
      name: command.name,
      description: command.description,
      source: "command" as const,
    })),
    ...skills.data
      .filter((skill) => !names.has(skill.id))
      .map((skill) => ({
        name: skill.id,
        description: skill.description,
        source: "skill" as const,
      })),
  ]
}
