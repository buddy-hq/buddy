export type ToolReturnExample = {
  readonly situation: string
  readonly text: string
}

export type ToolPrompt = {
  readonly id: string
  readonly name: string
  readonly stage: "today" | "proposed"
  readonly description: string
  readonly parameters: string
  readonly returns: readonly ToolReturnExample[]
}

export type ToolDesignStatus = "proposed" | "applied" | "historical"

export type ToolDesign = {
  readonly id: string
  readonly label: string
  readonly status: ToolDesignStatus
  readonly title: string
  readonly summary: string
  readonly why: readonly string[]
  readonly tools: readonly ToolPrompt[]
}

export type RegisteredToolPrompt = {
  readonly id: string
  readonly design: ToolDesign
  readonly tool: ToolPrompt
}
