import type { PromptContext } from "./context"
import { buildBuddyRuntimeContext } from "./runtime-context"
import { buildBuddyUserPrelude, type BuddyUserPreludePart } from "./user-prelude"

export type BuddyPromptEnvelope = {
  systemContext: string
  userPreludeParts: readonly BuddyUserPreludePart[]
  changedSinceCheckpoint?: boolean
}

export async function buildBuddyPromptEnvelope(input: PromptContext): Promise<BuddyPromptEnvelope> {
  const runtimeContext = await buildBuddyRuntimeContext(input)

  const userPreludeParts = buildBuddyUserPrelude({
    context: input,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  })

  return {
    systemContext: runtimeContext.runtimeContext,
    userPreludeParts,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  }
}
