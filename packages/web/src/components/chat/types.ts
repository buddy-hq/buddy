import type { RefObject } from "react"
import type { ResourceOpenOptions, ResourceReadingTarget } from "@/state/resources-query"
import type {
  MessageError,
  MessagePart,
  MessageWithParts,
  ProviderInfo,
  SessionStatusInfo,
} from "@/state/chat-types"

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

export interface ChatTranscriptProps {
  directory?: string
  scrollViewportRef?: RefObject<HTMLElement | null>
  userScrolled?: boolean
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export interface TurnRowProps {
  turn: ChatTurn
  turnIndex: number
  totalTurns: number
  addBottomSpacing?: boolean
  preferEagerMarkdown?: boolean
  providers: ProviderInfo[]
  isLastTurnBusy: boolean
  activeSessionStatus: SessionStatusInfo
  directory: string | undefined
  onAssistantTextFinalRender: () => void
  onOpenSession: ((sessionID: string) => void) | undefined
  onOpenResource:
    | ((directory: string, resource: ResourceReadingTarget, options?: ResourceOpenOptions) => void)
    | undefined
  onForkMessage:
    | ((input: { sessionID: string; messageID: string }) => Promise<void> | void)
    | undefined
  onRevertMessage:
    | ((input: { sessionID: string; messageID: string }) => Promise<void> | void)
    | undefined
}

export interface TurnRendererProps {
  turn: ChatTurn
  turnIndex: number
  totalTurns: number
  preferEagerMarkdown?: boolean
  providers: ProviderInfo[]
  isBusy: boolean
  activeSessionStatus: SessionStatusInfo
  directory?: string
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export interface AssistantSectionProps {
  assistantItems: AssistantRenderItem[]
  assistantCopyPartID: string | undefined
  assistantMetaText: string
  assistantAborted: boolean
  isBusy: boolean
  preferEagerMarkdown?: boolean
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  directory?: string
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  onAssistantTextFinalRender?: () => void
  isLastTurn: boolean
  lastAssistantTextID: string | undefined
  showThinking: boolean
  currentReasoningHeading?: string
}

export interface UserSectionProps {
  userMessage?: MessageWithParts
  providers: ProviderInfo[]
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export interface AssistantDerivedState {
  assistantItems: AssistantRenderItem[]
  assistantTextParts: MessagePart[]
  currentReasoningHeading: string | undefined
  assistantError: MessageError | undefined
  assistantErrorName: string | undefined
  assistantAborted: boolean
}
