import type { GetStartedChat } from "@/lib/get-started-chats"
import {
  createTextPromptDraft,
  type PromptDraftState,
} from "@/state/prompt-store"

export function createGetStartedChatDraft(
  chat: Pick<GetStartedChat, "prompt">,
  currentDraft: PromptDraftState,
): Omit<PromptDraftState, "updatedAt"> {
  return {
    ...createTextPromptDraft(chat.prompt),
    attachments: currentDraft.attachments,
  }
}
