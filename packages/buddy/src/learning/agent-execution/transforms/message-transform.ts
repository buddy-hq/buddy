import type { SessionTransform, SessionTransformContext } from "./types"
import { orchestrateSessionMessageTransform } from "./message-transform-orchestration"

export function createSessionMessageTransform(input: {
  context: SessionTransformContext
}): SessionTransform {
  let rollbackTeachingState: (() => void) | undefined

  return {
    onTransform: async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const result = await orchestrateSessionMessageTransform({
        context: input.context,
        body,
      })
      rollbackTeachingState = result.rollbackState
      return result.transformed
    },
    rollbackState: () => {
      rollbackTeachingState?.()
    },
  }
}
