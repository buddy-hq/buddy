import type { MessageWithParts } from "@buddy/transcript-contract/message"
import type { Session, SessionStatus } from "@buddy/transcript-contract/session"
import type { JsonObject, Mention, ModelSelection } from "./common"
import type { RuntimeResult } from "./errors"

export type PromptFile = {
  readonly uri: string
  readonly name?: string
  readonly description?: string
  readonly mention?: Mention
}

export type PromptAgentReference = { readonly name: string; readonly mention?: Mention }

export type PromptSkillReference = { readonly id: string; readonly mention?: Mention }

export type TurnSelection = {
  readonly agent?: string
  readonly model?: ModelSelection
}

export type PromptInput = TurnSelection & {
  readonly sessionID: string
  readonly messageID?: string
  readonly text: string
  readonly files?: readonly PromptFile[]
  readonly agents?: readonly PromptAgentReference[]
  readonly skills?: readonly PromptSkillReference[]
  readonly metadata?: JsonObject
  readonly delivery?: "queue" | "steer"
  readonly noReply?: boolean
}

export type CommandInput = TurnSelection & {
  readonly sessionID: string
  readonly name: string
  readonly arguments: string
  readonly files?: readonly PromptFile[]
  readonly agents?: readonly PromptAgentReference[]
  readonly skills?: readonly PromptSkillReference[]
  readonly delivery?: "queue" | "steer"
}

export type TurnOptions = {
  readonly directory: string
  readonly signal?: AbortSignal
  readonly onAccepted?: () => Promise<void>
}

export type TurnOutcome = "succeeded" | "failed" | "interrupted"

export type PromptAdmission = { readonly messageID: string }

export type TurnObservation = {
  readonly ready: Promise<RuntimeResult<TurnOutcome> | undefined>
  readonly result: Promise<RuntimeResult<TurnOutcome>>
  close(): Promise<void>
}

export interface Execution {
  observe(input: {
    readonly sessionID: string
    readonly messageID: string
    readonly signal?: AbortSignal
  }): TurnObservation
  admit(input: PromptInput): Promise<RuntimeResult<PromptAdmission>>
  prompt(input: PromptInput, options: TurnOptions): Promise<RuntimeResult<MessageWithParts>>
  command(
    input: CommandInput,
    options: TurnOptions,
  ): Promise<RuntimeResult<MessageWithParts | Session>>
  compact(
    input: TurnSelection & { readonly sessionID: string },
    signal?: AbortSignal,
  ): Promise<RuntimeResult<true>>
  interrupt(sessionID: string): Promise<boolean>
  background(sessionID: string): Promise<void>
  statuses(): Promise<Record<string, SessionStatus>>
  wait(sessionID: string): Promise<TurnOutcome | undefined>
  generate(input: {
    readonly sessionID: string
    readonly prompt: string
    readonly signal?: AbortSignal
  }): Promise<string>
}
