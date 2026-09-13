import { getPromptDraft, usePromptStore, type PromptDraftState } from "@/state/prompt-store"

export type TPromptComposerLiveDraft = Omit<PromptDraftState, "updatedAt">

type TPromptComposerLiveDraftReader = () => TPromptComposerLiveDraft

const liveDraftReadersByPromptKey = new Map<string, TPromptComposerLiveDraftReader>()

export function registerPromptComposerLiveDraftReader(
  promptKey: string,
  readLiveDraft: TPromptComposerLiveDraftReader,
): () => void {
  liveDraftReadersByPromptKey.set(promptKey, readLiveDraft)
  return () => {
    if (liveDraftReadersByPromptKey.get(promptKey) === readLiveDraft) {
      liveDraftReadersByPromptKey.delete(promptKey)
    }
  }
}

export function resetPromptComposerLiveDraftReadersForTests(): void {
  liveDraftReadersByPromptKey.clear()
}

export function readPromptComposerLiveDraft(promptKey: string): TPromptComposerLiveDraft {
  const readLiveDraft = liveDraftReadersByPromptKey.get(promptKey)
  if (readLiveDraft) return readLiveDraft()
  const stored = getPromptDraft(usePromptStore.getState(), promptKey)
  return {
    value: stored.value,
    parts: stored.parts,
    attachments: stored.attachments,
    cursor: stored.cursor,
  }
}
