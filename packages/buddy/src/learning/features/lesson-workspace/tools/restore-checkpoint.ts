import RESTORE_CHECKPOINT_DESCRIPTION from "./restore-checkpoint.md"
import z from "zod"
import { TeachingWorkspaceNotFoundError } from "../service/errors"
import { TeachingService } from "../service/operations"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"

const teachingRestoreCheckpointTool = createBuddyTool({
  id: "teaching_restore_checkpoint",
  description: RESTORE_CHECKPOINT_DESCRIPTION,
  parameters: z.object({}),
  constraints: {
    teachingWorkspace: "active",
  },
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
        throw new Error("No teaching workspace exists for this session yet", { cause: error })
      }
      throw error
    }
  },
})

export { teachingRestoreCheckpointTool }
