import type { TJsonObject } from "../../prompt/utils"
import type { SessionTransform, SessionTransformContext } from "./types"
import { orchestrateSessionMessageTransform } from "./message-transform-orchestration"

export function createSessionMessageTransform(input: {
  context: SessionTransformContext
}): SessionTransform {
  let rollbackTeachingState: (() => void) | undefined
  let onAcceptedTransform: (() => Promise<void>) | undefined

  return {
    onTransform: async (body: TJsonObject): Promise<TJsonObject> => {
      const result = await orchestrateSessionMessageTransform({
        context: input.context,
        body,
      })
      rollbackTeachingState = result.rollbackState
      onAcceptedTransform = result.onAccepted
      return result.transformed
    },
    rollbackState: () => {
      rollbackTeachingState?.()
    },
    onAccepted: async () => {
      await onAcceptedTransform?.()
    },
  }
}
