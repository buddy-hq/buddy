import z from "zod"

export const TeachingLanguageSchema = z.enum(["ts", "tsx"])

export type TeachingLanguage = z.infer<typeof TeachingLanguageSchema>

export const TeachingWorkspaceRecordSchema = z.object({
  sessionID: z.string(),
  language: TeachingLanguageSchema,
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  revision: z.number().int().nonnegative(),
  timeCreated: z.number().int().nonnegative(),
  timeUpdated: z.number().int().nonnegative(),
  fileHash: z.string(),
})

export type TeachingWorkspaceRecord = z.infer<typeof TeachingWorkspaceRecordSchema>

export const TeachingWorkspaceResponseSchema = z.object({
  sessionID: z.string(),
  workspaceRoot: z.string(),
  language: TeachingLanguageSchema,
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  revision: z.number().int().nonnegative(),
  code: z.string(),
})

export type TeachingWorkspaceResponse = z.infer<typeof TeachingWorkspaceResponseSchema>

export const TeachingWorkspaceUpdateRequestSchema = z.object({
  code: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  language: TeachingLanguageSchema.optional(),
})

export type TeachingWorkspaceUpdateRequest = z.infer<typeof TeachingWorkspaceUpdateRequestSchema>

export const TeachingPromptContextSchema = z.object({
  active: z.boolean(),
  sessionID: z.string(),
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  language: TeachingLanguageSchema,
  revision: z.number().int().nonnegative(),
  selectionStartLine: z.number().int().positive().optional(),
  selectionStartColumn: z.number().int().positive().optional(),
  selectionEndLine: z.number().int().positive().optional(),
  selectionEndColumn: z.number().int().positive().optional(),
})

export type TeachingPromptContext = z.infer<typeof TeachingPromptContextSchema>
