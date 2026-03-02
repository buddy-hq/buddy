import z from "zod"
import { TeachingService, TeachingWorkspaceNotFoundError } from "../service.js"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"

const teachingRestoreCheckpointTool = createBuddyTool("teaching_restore_checkpoint", {
  description: "Restore the active lesson file from the last accepted teaching checkpoint.",
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    try {
      const current = await TeachingService.read(ctx.directory, ctx.sessionID)
      await ctx.ask({
        permission: "teaching_restore_checkpoint",
        patterns: [current.lessonFilePath, current.checkpointFilePath],
        always: ["*"],
        metadata: {
          lessonFilePath: current.lessonFilePath,
          checkpointFilePath: current.checkpointFilePath,
        },
      })

      const workspace = await TeachingService.restore(ctx.directory, ctx.sessionID)
      return {
        title: "Teaching lesson restored",
        output: `Restored ${workspace.lessonFilePath} from the last accepted checkpoint`,
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

export { teachingRestoreCheckpointTool }
