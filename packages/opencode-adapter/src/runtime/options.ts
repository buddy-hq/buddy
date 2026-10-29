import type { ToolPresentationLookup } from "@buddy/transcript-contract/session-tool-presentation"

export type OpenCodeRuntimeOptions = {
  readonly presentation?: (directory: string) => ToolPresentationLookup | undefined
}
