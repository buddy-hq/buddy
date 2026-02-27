import z from "zod"

export const TeachingLanguageSchema = z.enum(["ts", "tsx"])

export type TeachingLanguage = z.infer<typeof TeachingLanguageSchema>

export const TeachingWorkspaceFileRecordSchema = z.object({
  relativePath: z.string(),
  fileHash: z.string(),
})

export type TeachingWorkspaceFileRecord = z.infer<typeof TeachingWorkspaceFileRecordSchema>

export const TeachingWorkspaceFileSchema = z.object({
  relativePath: z.string(),
  filePath: z.string(),
  checkpointFilePath: z.string(),
  language: TeachingLanguageSchema,
})

export type TeachingWorkspaceFile = z.infer<typeof TeachingWorkspaceFileSchema>

export const TeachingDiagnosticSeveritySchema = z.enum(["error", "warning", "info", "hint"])

export type TeachingDiagnosticSeverity = z.infer<typeof TeachingDiagnosticSeveritySchema>

export const TeachingDiagnosticSchema = z.object({
  message: z.string(),
  severity: TeachingDiagnosticSeveritySchema,
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  startLine: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive(),
})

export type TeachingDiagnostic = z.infer<typeof TeachingDiagnosticSchema>

export const TeachingWorkspaceRecordSchema = z.object({
  sessionID: z.string(),
  language: TeachingLanguageSchema,
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  files: z.array(TeachingWorkspaceFileRecordSchema).optional(),
  activeRelativePath: z.string().optional(),
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
  files: z.array(TeachingWorkspaceFileSchema),
  activeRelativePath: z.string(),
  revision: z.number().int().nonnegative(),
  code: z.string(),
  lspAvailable: z.boolean(),
  diagnostics: z.array(TeachingDiagnosticSchema),
})

export type TeachingWorkspaceResponse = z.infer<typeof TeachingWorkspaceResponseSchema>

export const TeachingWorkspaceUpdateRequestSchema = z.object({
  code: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  relativePath: z.string().optional(),
  language: TeachingLanguageSchema.optional(),
})

export type TeachingWorkspaceUpdateRequest = z.infer<typeof TeachingWorkspaceUpdateRequestSchema>

export const TeachingWorkspaceCreateFileRequestSchema = z.object({
  relativePath: z.string().min(1),
  content: z.string().optional(),
  language: TeachingLanguageSchema.optional(),
  activate: z.boolean().optional(),
})

export type TeachingWorkspaceCreateFileRequest = z.infer<typeof TeachingWorkspaceCreateFileRequestSchema>

export const TeachingWorkspaceActivateFileRequestSchema = z.object({
  relativePath: z.string().min(1),
})

export type TeachingWorkspaceActivateFileRequest = z.infer<typeof TeachingWorkspaceActivateFileRequestSchema>

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
