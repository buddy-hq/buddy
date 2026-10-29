import type { BuddyEvent } from "@buddy/transcript-contract/event"
import type { TurnOutcome } from "./execution"
import { z } from "zod"

export type { SessionStoppedEvent } from "@buddy/transcript-contract/event"

export const McpInputRequestedEventSchema = z.object({
  type: z.literal("mcp.input.requested"),
  properties: z.object({
    requestID: z.string(),
    server: z.string(),
    message: z.string().optional(),
    toolPrefix: z.string(),
  }),
}).meta({ ref: "McpInputRequestedEvent" })
export type McpInputRequestedEvent = z.infer<typeof McpInputRequestedEventSchema>

export const McpInputSettledEventSchema = z.object({
  type: z.literal("mcp.input.settled"),
  properties: z.object({ requestID: z.string() }),
}).meta({ ref: "McpInputSettledEvent" })
export type McpInputSettledEvent = z.infer<typeof McpInputSettledEventSchema>

export type RuntimeSignal =
  | { readonly type: "turn.finished"; readonly sessionID: string; readonly outcome: TurnOutcome; readonly reason?: "user" | "shutdown" | "superseded" | "inactivity" }
  | { readonly type: "conversation.renamed"; readonly sessionID: string; readonly title: string; readonly directory?: string }

export interface Events {
  stream(input: { readonly directory: string; readonly signal?: AbortSignal }): AsyncIterable<BuddyEvent>
  signals(input: { readonly signal?: AbortSignal }): AsyncIterable<RuntimeSignal>
}
