import z from "zod"

const BuddyProjectIconSchema = z.object({
  url: z.string().optional(),
  override: z.string().optional(),
  color: z.string().optional(),
})

const BuddyProjectCommandsSchema = z.object({
  start: z.string().optional(),
})

const BuddyProjectTimeSchema = z.object({
  created: z.number(),
  updated: z.number(),
  initialized: z.number().optional(),
})

const BuddyProjectInfoSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  vcs: z.enum(["git"]).optional(),
  name: z.string().optional(),
  icon: BuddyProjectIconSchema.optional(),
  commands: BuddyProjectCommandsSchema.optional(),
  time: BuddyProjectTimeSchema,
  sandboxes: z.array(z.string()),
})

const BuddyProjectUpdateSchema = z.object({
  name: z.string().optional(),
  icon: BuddyProjectIconSchema.optional(),
  commands: BuddyProjectCommandsSchema.optional(),
})

export {
  BuddyProjectCommandsSchema,
  BuddyProjectIconSchema,
  BuddyProjectInfoSchema,
  BuddyProjectTimeSchema,
  BuddyProjectUpdateSchema,
}
