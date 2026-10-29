import type { OpenCodeClient } from "@opencode/client"

export type SessionClient = Pick<OpenCodeClient, "session" | "message">
export type EventClient = {
  readonly event: Pick<OpenCodeClient["event"], "subscribe">
  readonly session: Pick<OpenCodeClient["session"], "get" | "message">
  readonly message: Pick<OpenCodeClient["message"], "list">
}
export type {
  OpenCodeEvent,
  SessionInfo as UpstreamSession,
  SessionMessageInfo as UpstreamMessage,
} from "@opencode/client"
