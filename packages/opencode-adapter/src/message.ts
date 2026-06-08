import { Database } from "@opencode-ai/core/database/database"
import * as MessageSchemas from "@opencode-ai/core/v1/session"
import { ManagedRuntime } from "effect"
import * as MessageRuntime from "opencode/session/message-v2"

const runtime = ManagedRuntime.make(Database.defaultLayer)

async function page(input: Parameters<typeof MessageRuntime.page>[0]) {
  return runtime.runPromise(MessageRuntime.page(input))
}

// Stable Buddy-facing bridge for OpenCode v1 message schemas plus runtime helpers.
export const MessageV2 = {
  ...MessageSchemas,
  page,
}

export namespace MessageV2 {
  export type Assistant = MessageSchemas.Assistant
  export type Info = MessageSchemas.Info
  export type Part = MessageSchemas.Part
  export type ToolPart = MessageSchemas.ToolPart
  export type User = MessageSchemas.User
  export type WithParts = MessageSchemas.WithParts
}
