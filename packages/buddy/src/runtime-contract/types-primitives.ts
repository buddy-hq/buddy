export type ToolAccess = "inherit" | "allow" | "deny"
export type ToolDelta<TToolId extends string = string> = Partial<Record<TToolId, ToolAccess>>

export type SubagentAccess = "inherit" | "allow" | "deny" | "prefer"
export type SubagentDelta<TSubagentId extends string = string> = Partial<Record<TSubagentId, SubagentAccess>>
