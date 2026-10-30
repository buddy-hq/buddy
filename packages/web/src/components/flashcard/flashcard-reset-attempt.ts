import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

type FlashcardResetTarget = {
  directory: string
  objectID: string
}

const resetAttempts = new Map<string, Promise<ObjectFlashcardDeckReadDeckResponse>>()
const resetAttemptCounts = new Map<string, number>()

export function readFlashcardResetAttempt(
  input: FlashcardResetTarget,
): Promise<ObjectFlashcardDeckReadDeckResponse> | undefined {
  return resetAttempts.get(JSON.stringify([input.directory, input.objectID]))
}

export function readFlashcardResetAttemptCount(input: FlashcardResetTarget): number {
  return resetAttemptCounts.get(JSON.stringify([input.directory, input.objectID])) ?? 0
}

export function startOrJoinFlashcardResetAttempt(
  input: FlashcardResetTarget & {
    onSettled: (outcome: { status: "success" } | { status: "error"; error: unknown }) => void
  },
): Promise<ObjectFlashcardDeckReadDeckResponse> {
  const { directory, objectID, onSettled } = input
  const key = JSON.stringify([directory, objectID])
  const running = resetAttempts.get(key)
  if (running) return running

  async function reset() {
    try {
      const deck = requireBuddyData(
        await getBuddyClient(directory).objectFlashcardDeck.resetProgress({ directory, objectID }),
      )
      onSettled({ status: "success" })
      return deck
    } catch (error) {
      onSettled({ status: "error", error })
      throw error
    }
  }
  const attempt = reset().finally(() => {
    resetAttempts.delete(key)
  })
  resetAttempts.set(key, attempt)
  resetAttemptCounts.set(key, (resetAttemptCounts.get(key) ?? 0) + 1)
  return attempt
}
