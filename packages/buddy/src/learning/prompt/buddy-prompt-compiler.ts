import type { PromptContext } from "./context"
import { buildBuddyRuntimeContext } from "./runtime-context"
import { buildBuddyUserPrelude, type BuddyUserPreludePart } from "./user-prelude"
import {
  buildLearnerContextView,
  decideLearnerContextDelivery,
} from "../shared/learner-context-delivery"

export type BuddyPromptEnvelope = {
  systemContext: string
  userPreludeParts: readonly BuddyUserPreludePart[]
  changedSinceCheckpoint?: boolean
  deliveredLearnerContext?: {
    fingerprint: string
    items: ReturnType<typeof buildLearnerContextView>["items"]
    kind: "bootstrap" | "delta"
  }
}

export async function buildBuddyPromptEnvelope(input: PromptContext): Promise<BuddyPromptEnvelope> {
  const runtimeContext = await buildBuddyRuntimeContext(input)
  const learnerContextView = buildLearnerContextView(input.learnerSnapshot)
  const learnerContextDelivery = decideLearnerContextDelivery({
    current: {
      ...learnerContextView,
      fingerprint: input.learnerContextDigest ?? learnerContextView.fingerprint,
    },
    previousFingerprint: input.priorLearnerContextDigest,
    previousItems: input.priorLearnerContextItems,
  })

  const userPreludeParts = buildBuddyUserPrelude({
    context: input,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  })

  return {
    systemContext: runtimeContext.runtimeContext,
    userPreludeParts,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
    ...(learnerContextDelivery
      ? {
          deliveredLearnerContext: {
            fingerprint: learnerContextDelivery.fingerprint,
            items: learnerContextView.items,
            kind: learnerContextDelivery.kind,
          },
        }
      : {}),
  }
}
