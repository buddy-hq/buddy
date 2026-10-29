import type { Session } from "@buddy/transcript-contract/session"

export type JsonValue = NonNullable<Session["metadata"]>[string]

export type JsonObject = { readonly [key: string]: JsonValue }

export type ModelSelection = {
  readonly providerID: string
  readonly modelID: string
  readonly variant?: string
}

export type Mention = {
  readonly text: string
  readonly start: number
  readonly end: number
}
