import z from "zod"
import { TeachingService, TeachingWorkspaceNotFoundError } from "../service.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { executeWriteWithoutPrompt } from "./write-without-prompt.js"

const teachingSetLessonTool = createBuddyTool("teaching_set_lesson", {
  description:
    "Replace the active lesson file in-place with a new canonical lesson scaffold and sync the teaching checkpoint to match it. This rewrites the current active teaching file without changing its path or file type. Use teaching_add_file first if you need a different file or extension.",
  parameters: z.object({
    content: z.string().describe("The full lesson content to place into the active editor file"),
  }),
  async execute(params: { content: string }, ctx: BuddyToolContext) {
    try {
      const current = await TeachingService.read(ctx.directory, ctx.sessionID)
      await ctx.ask({
        permission: "teaching_set_lesson",
        patterns: [current.lessonFilePath, current.checkpointFilePath],
        always: ["*"],
        metadata: {
          lessonFilePath: current.lessonFilePath,
          checkpointFilePath: current.checkpointFilePath,
          language: current.language,
        },
      })

      const writeResult = await executeWriteWithoutPrompt(ctx, {
        filePath: current.lessonFilePath,
        content: params.content,
      })
      await TeachingService.checkpoint(ctx.directory, ctx.sessionID)
      const workspace = await TeachingService.read(ctx.directory, ctx.sessionID)
      return {
        title: "Teaching lesson updated",
        output: writeResult.output.replace(
          "Wrote file successfully.",
          `Lesson scaffold synced at ${workspace.lessonFilePath}`,
        ),
        metadata: workspace,
      }
    } catch (error) {
      if (error instanceof TeachingWorkspaceNotFoundError) {
        throw new Error("No teaching workspace exists for this session yet")
      }
      throw error
    }
  },
})

export { teachingSetLessonTool }
