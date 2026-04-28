import SET_LESSON_DESCRIPTION from "./set-lesson.md"
import z from "zod"
import { TeachingWorkspaceNotFoundError } from "../service/errors"
import { TeachingService } from "../service/operations"
import {
  createBuddyTool,
  EDITOR_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  type BuddyToolContext,
} from "../../../tools/create-buddy-tool"
import { executeWriteWithoutPrompt } from "./write-without-prompt"

const teachingSetLessonTool = createBuddyTool({
  id: "teaching_set_lesson",
  description: SET_LESSON_DESCRIPTION,
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
        throw new Error("No teaching workspace exists for this session yet", { cause: error })
      }
      throw error
    }
  },
  capability: {
    surfaces: [EDITOR_PERSONA_SURFACE],
    workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
  },
})

export { teachingSetLessonTool }
