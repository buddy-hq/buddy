import { createTextPromptDraft, type PromptDraftState } from "@/state/prompt-store"

const RECOVERABLE_ERROR_CONTINUE_PROMPT = "Continue"

type ErrorRecoveryDraft = Omit<PromptDraftState, "updatedAt">

export type ErrorRecoveryPromptInput = {
  content: string
  parts: ErrorRecoveryDraft["parts"]
  attachments: ErrorRecoveryDraft["attachments"]
  targetSessionID: string
  clearDrafts: boolean
  includeActiveContext: boolean
}

export function createErrorRecoveryContinueDraft(): ErrorRecoveryDraft {
  return createTextPromptDraft(RECOVERABLE_ERROR_CONTINUE_PROMPT)
}

export function createErrorRecoveryPromptInput(
  draft: ErrorRecoveryDraft,
  targetSessionID: string,
): ErrorRecoveryPromptInput {
  return {
    content: draft.value,
    parts: draft.parts,
    attachments: draft.attachments,
    targetSessionID,
    clearDrafts: false,
    includeActiveContext: false,
  }
}
