import type { MessageWithParts } from "@buddy/transcript-contract/message"
import type { Session, SessionCreate } from "@buddy/transcript-contract/session"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import type { JsonValue } from "./common"

export type ConversationQuery = {
  readonly directory: string
  readonly project?: string
  readonly roots?: boolean
  readonly parentID?: string
  readonly search?: string
  readonly updatedSince?: number
  readonly limit?: number
  readonly include?: (session: Session) => Promise<boolean>
}

export type ConversationCreate = SessionCreate & {
  readonly permissions?: PermissionRuleset
  readonly signal?: AbortSignal
}

export type ConversationUpdate = {
  readonly title?: string
  readonly time?: { readonly archived?: number }
}

export type HistoryScope = {
  readonly sessionID: string
  readonly directory: string
  readonly parentID?: string
}

export type HistoryPage = {
  readonly items: MessageWithParts[]
  readonly cursor?: string
}

export type ConversationTranscript = {
  readonly session: Session
  readonly messages: MessageWithParts[]
}

export type MetadataPatch = { readonly [key: string]: JsonValue | undefined }

export interface Conversations {
  get(sessionID: string): Promise<Session>
  list(query: ConversationQuery): Promise<Session[]>
  children(sessionID: string): Promise<Session[]>
  create(directory: string, input?: ConversationCreate): Promise<Session>
  update(sessionID: string, input: ConversationUpdate): Promise<Session>
  patchMetadata(sessionID: string, patch: MetadataPatch): Promise<Session>
  remove(sessionID: string): Promise<void>
  fork(sessionID: string, input?: { readonly beforeMessageID?: string }): Promise<Session>
  revert(sessionID: string, messageID: string): Promise<Session>
  unrevert(sessionID: string): Promise<Session>
  history(
    scope: HistoryScope,
    page?: { readonly limit?: number; readonly before?: string },
  ): Promise<HistoryPage>
  message(scope: HistoryScope, messageID: string): Promise<MessageWithParts | undefined>
  transcript(sessionID: string): Promise<ConversationTranscript>
}
