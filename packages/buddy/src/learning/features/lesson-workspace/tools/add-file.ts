import ADD_FILE_DESCRIPTION from "./add-file.md"
import z from "zod"
import { TeachingWorkspaceFileError, TeachingWorkspaceNotFoundError } from "../service/errors"
import { TeachingService } from "../service/operations"
import { TeachingPath } from "../paths/path"
import { TeachingLanguageSchema, type TeachingLanguage } from "../model/types"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { executeWriteWithoutPrompt } from "./write-without-prompt"

function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const teachingAddFileTool = createBuddyTool({
  id: "teaching_add_file",
  description: ADD_FILE_DESCRIPTION,
  parameters: z.object({
    relativePath: z
      .string()
      .describe("Workspace-relative path for the new file, for example helpers/math.ts"),
    content: z.string().optional().describe("Optional starter content for the new file"),
    language: TeachingLanguageSchema.optional().describe(
      "Optional language mode used only when the path omits an extension",
    ),
    activate: z
      .boolean()
      .optional()
      .describe("Whether the new file should become the active editor file"),
  }),
  presentation: {
    archetype: "activity",
    icon: "edit",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: {
        action: "Adding",
        detail: ({ input }) => parseToolInputString(input.relativePath),
      },
      running: {
        action: "Adding",
        detail: ({ input }) => parseToolInputString(input.relativePath),
      },
      completed: {
        action: "Added",
        detail: ({ input }) => parseToolInputString(input.relativePath),
      },
      error: {
        action: "Failed to add",
        detail: ({ input }) => parseToolInputString(input.relativePath),
      },
    },
    summary: {
      category: "add-lesson-files",
      pending: "Adding lesson files",
      running: "Adding lesson files",
      completed: "Added lesson files",
      error: "Failed to add lesson files",
    },
  },
  constraints: {
    teachingWorkspace: "active",
  },
  async execute(
    params: {
      relativePath: string
      content?: string
      language?: TeachingLanguage
      activate?: boolean
    },
    ctx: BuddyToolContext,
  ) {
    try {
      await TeachingService.read(ctx.directory, ctx.sessionID)
      const nextRelativePath = params.language
        ? TeachingPath.normalizeRelativePath(params.relativePath, params.language)
        : TeachingPath.normalizeRelativePath(params.relativePath)
      const filePath = TeachingPath.workspaceFile(ctx.directory, ctx.sessionID, nextRelativePath)
      const checkpointFilePath = TeachingPath.checkpointSnapshotFile(
        ctx.directory,
        ctx.sessionID,
        nextRelativePath,
      )

      await ctx.ask({
        permission: "teaching_add_file",
        patterns: [filePath, checkpointFilePath],
        always: ["*"],
        metadata: {
          filePath,
          checkpointFilePath,
          activate: params.activate ?? true,
        },
      })

      const writeResult = await executeWriteWithoutPrompt(ctx, {
        filePath,
        content: params.content ?? "",
      })
      const workspace = await TeachingService.trackExistingFile(ctx.directory, ctx.sessionID, {
        relativePath: nextRelativePath,
        activate: params.activate,
      })
      return {
        title: "Teaching file created",
        output: writeResult.output.replace(
          "Wrote file successfully.",
          `Added ${nextRelativePath} to the teaching workspace`,
        ),
        metadata: workspace,
      }
    } catch (error) {
      if (error instanceof TeachingWorkspaceNotFoundError) {
        throw new Error("No teaching workspace exists for this session yet", { cause: error })
      }
      if (error instanceof TeachingWorkspaceFileError) {
        throw new Error(error.message, { cause: error })
      }
      throw error
    }
  },
})

export { teachingAddFileTool }
