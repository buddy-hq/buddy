import z from "zod"
import type { OpenCodeTypes } from "@buddy/opencode-adapter/host"

const projectIconSchema = z.object({
  url: z.string().optional(),
  override: z.string().optional(),
  color: z.string().optional(),
})
const projectCommandsSchema = z.object({ start: z.string().optional() })

export const projectUpdateSchema = z.object({
  name: z.string().optional(),
  icon: projectIconSchema.optional(),
  commands: projectCommandsSchema.optional(),
})

export const projectSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  vcs: z.string().optional(),
  name: z.string().optional(),
  icon: projectIconSchema.optional(),
  commands: projectCommandsSchema.optional(),
  time: z.object({ created: z.number(), updated: z.number(), initialized: z.number() }),
  sandboxes: z.array(z.string()),
}).meta({ id: "Project" })

export function toBuddyProject(project: OpenCodeTypes.Project) {
  return {
    id: project.id,
    worktree: project.canonical,
    vcs: project.vcs,
    name: project.name,
    icon: project.icon,
    commands: project.commands,
    time: { created: project.time.created, updated: project.time.updated, initialized: project.time.active },
    sandboxes: project.sandboxes,
  }
}
