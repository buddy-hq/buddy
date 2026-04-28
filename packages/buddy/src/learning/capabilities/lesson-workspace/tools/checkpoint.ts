import CHECKPOINT_DESCRIPTION from "./checkpoint.md"
import z from "zod"
import { TeachingWorkspaceNotFoundError } from "../service/errors"
import { TeachingService } from "../service/operations"
import {
  createBuddyTool,
  EDITOR_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  type BuddyToolContext,
} from "../../../tools/create-buddy-tool"

const teachingCheckpointTool = createBuddyTool({
  id: "teaching_checkpoint",
  description: CHECKPOINT_DESCRIPTION,
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    try {
      const current = await TeachingService.read(ctx.directory, ctx.sessionID)
      await ctx.ask({
        permission: "teaching_checkpoint",
        patterns: [current.checkpointFilePath],
        always: ["*"],
        metadata: {
          lessonFilePath: current.lessonFilePath,
          checkpointFilePath: current.checkpointFilePath,
        },
      })

      const checkpoint = await TeachingService.checkpoint(ctx.directory, ctx.sessionID)
      return {
        title: "Teaching checkpoint",
        output: `Checkpoint saved to ${checkpoint.checkpointFilePath}`,
        metadata: checkpoint,
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

export { teachingCheckpointTool }
