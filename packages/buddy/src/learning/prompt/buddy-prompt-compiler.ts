import type { BuddyPromptBuildContext, BuddyPromptEnvelope } from "./contracts"
import { buildBuddySystemContext } from "./runtime-context"
import { buildBuddyUserPrelude } from "./user-prelude"

export async function buildBuddyPromptEnvelope(
  input: BuddyPromptBuildContext,
): Promise<BuddyPromptEnvelope> {
  const systemContext = await buildBuddySystemContext(input)
  const userPreludeParts = buildBuddyUserPrelude({
    context: input,
    changedSinceCheckpoint: systemContext.changedSinceCheckpoint,
  })

  return {
    systemContext: systemContext.systemContext,
    userPreludeParts,
    changedSinceCheckpoint: systemContext.changedSinceCheckpoint,
  }
}
