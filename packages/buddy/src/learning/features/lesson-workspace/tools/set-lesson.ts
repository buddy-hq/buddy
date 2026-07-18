import SET_LESSON_DESCRIPTION from "./set-lesson.md"
import z from "zod"
import { TeachingWorkspaceNotFoundError } from "../service/errors"
import { TeachingService } from "../service/operations"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { executeWriteWithoutPrompt } from "./write-without-prompt"

const teachingSetLessonTool = createBuddyTool({
  id: "teaching_set_lesson",
  description: SET_LESSON_DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("The full lesson content to place into the active editor file"),
  }),
  presentation: {
    archetype: "activity",
    icon: "edit",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: { action: "Updating lesson" },
      running: { action: "Updating lesson" },
      completed: { action: "Updated lesson" },
      error: { action: "Failed to update lesson" },
    },
    summary: {
      category: "update-lesson",
      pending: "Updating lesson",
      running: "Updating lesson",
      completed: "Updated lesson",
      error: "Failed to update lesson",
    },
  },
  constraints: {
    teachingWorkspace: "active",
  },
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
        throw new Error("No teaching workspace exists for this session yet", { cause: error })
      }
      throw error
    }
  },
})

export { teachingSetLessonTool }
