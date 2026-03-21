import z from 'zod'
import { TeachingService, TeachingWorkspaceNotFoundError } from '..'
import { createBuddyTool, type BuddyToolContext } from '../../../tools'

const teachingCheckpointTool = createBuddyTool('teaching_checkpoint', {
  description: 'Copy the active lesson file into its teaching checkpoint file.',
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    try {
      const current = await TeachingService.read(ctx.directory, ctx.sessionID)
      await ctx.ask({
        permission: 'teaching_checkpoint',
        patterns: [current.checkpointFilePath],
        always: ['*'],
        metadata: {
          lessonFilePath: current.lessonFilePath,
          checkpointFilePath: current.checkpointFilePath,
        },
      })

      const checkpoint = await TeachingService.checkpoint(ctx.directory, ctx.sessionID)
      return {
        title: 'Teaching checkpoint',
        output: `Checkpoint saved to ${checkpoint.checkpointFilePath}`,
        metadata: checkpoint,
      }
    } catch (error) {
      if (error instanceof TeachingWorkspaceNotFoundError) {
        throw new Error('No teaching workspace exists for this session yet', { cause: error })
      }
      throw error
    }
  },
})

export { teachingCheckpointTool }
