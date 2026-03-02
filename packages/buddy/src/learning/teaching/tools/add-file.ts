import z from "zod"
import {
  TeachingService,
  TeachingWorkspaceFileError,
  TeachingWorkspaceNotFoundError,
} from "../service.js"
import { TeachingPath } from "../path.js"
import { TeachingLanguageSchema, type TeachingLanguage } from "../types.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { executeWriteWithoutPrompt } from "./write-without-prompt.js"

const teachingAddFileTool = createBuddyTool("teaching_add_file", {
  description:
    "Create a new tracked file inside the teaching workspace so lessons can span multiple files. The relativePath should include the intended extension (for example lesson.rs or vite.config.js). Only supply language when the path has no extension and you want Buddy to append one.",
  parameters: z.object({
    relativePath: z.string().describe("Workspace-relative path for the new file, for example helpers/math.ts"),
    content: z.string().optional().describe("Optional starter content for the new file"),
    language: TeachingLanguageSchema.optional().describe("Optional language mode used only when the path omits an extension"),
    activate: z.boolean().optional().describe("Whether the new file should become the active editor file"),
  }),
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
      const checkpointFilePath = TeachingPath.checkpointSnapshotFile(ctx.directory, ctx.sessionID, nextRelativePath)

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
        throw new Error("No teaching workspace exists for this session yet")
      }
      if (error instanceof TeachingWorkspaceFileError) {
        throw new Error(error.message)
      }
      throw error
    }
  },
})

export { teachingAddFileTool }
