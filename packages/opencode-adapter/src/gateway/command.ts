import type { OpenCodeClient } from "@opencode/client"

export async function listExecutableCommands(client: Pick<OpenCodeClient, "command" | "skill">, directory: string) {
  const location = { directory }
  const [commands, skills] = await Promise.all([client.command.list({ location }), client.skill.list({ location })])
  const names = new Set(commands.data.map((command) => command.name))
  return [
    ...commands.data.map((command) => ({ name: command.name, description: command.description, source: "command" as const })),
    ...skills.data.filter((skill) => !names.has(skill.id)).map((skill) => ({ name: skill.id, description: skill.description, source: "skill" as const })),
  ]
}
