import type { RefObject } from "react"
import type { ResourceOpenOptions, ResourceReadingTarget } from "@/state/resources-query"
import type { MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"

export type { MessageWithParts, ProviderInfo, SessionStatusInfo } from "@/state/chat-types"

export type AssistantRenderItem =
  | {
      type: "abstracted"
      key: string
      parts: MessagePart[]
    }
  | {
      type: "part"
      key: string
      part: MessagePart
    }
  | {
      type: "grouped-parts"
      key: string
      tool: string
      parts: MessagePart[]
    }

export type ChatTurn = {
  key: string
  user?: MessageWithParts
  assistants: MessageWithParts[]
}

export type ChatTranscriptProps = {
  directory?: string
  scrollViewportRef?: RefObject<HTMLElement | null>
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  onForkMessage?: (input: {
    sessionID: string
    /** Exclusive upper bound (keep id < messageID). Omit to clone the full session. */
    messageID?: string
  }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export type UserSectionProps = {
  userMessage?: MessageWithParts
  providers: ProviderInfo[]
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}
