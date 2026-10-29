import z from "zod"
import type { ProjectInfo } from "@buddy/agent-runtime/workspace"

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

export const projectSchema: z.ZodType<ProjectInfo> = z.object({
  id: z.string(),
  worktree: z.string(),
  vcs: z.string().optional(),
  name: z.string().optional(),
  icon: projectIconSchema.optional(),
  commands: projectCommandsSchema.optional(),
  time: z.object({ created: z.number(), updated: z.number(), initialized: z.number() }),
  sandboxes: z.array(z.string()),
}).meta({ id: "Project" })
