import type { RefObject } from "react"
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

export type ChatTurn = {
  key: string
  user?: MessageWithParts
  assistants: MessageWithParts[]
}

export interface ChatTranscriptProps {
  directory?: string
  scrollViewportRef?: RefObject<HTMLElement>
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export interface TurnRowProps {
  turn: ChatTurn
  turnIndex: number
  totalTurns: number
  addBottomSpacing?: boolean
  providers: ProviderInfo[]
  isLastTurnBusy: boolean
  activeSessionStatus: SessionStatusInfo
  directory: string | undefined
  onAssistantTextFinalRender: () => void
  onOpenSession: ((sessionID: string) => void) | undefined
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
  providers: ProviderInfo[]
  isBusy: boolean
  activeSessionStatus: SessionStatusInfo
  directory?: string
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

export interface AssistantSectionProps {
  assistantItems: AssistantRenderItem[]
  collapsedAbstractedKeys: Set<string>
  assistantCopyPartID: string | undefined
  assistantMetaText: string
  assistantAborted: boolean
  isBusy: boolean
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  directory?: string
  onOpenSession?: (sessionID: string) => void
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
  collapsedAbstractedKeys: Set<string>
  assistantTextParts: MessagePart[]
  currentReasoningHeading: string | undefined
  assistantError: MessageError | undefined
  assistantErrorName: string | undefined
}
