export function titleFromToolName(tool: string): string {
  return tool
    .split("_")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ")
}

const BUDDY_CUSTOM_TOOL_PREFIXES = [
  "teaching_",
  "goal_",
  "learner_",
  "curriculum_",
  "pedagogy_",
] as const

export function isBuddyCustomTool(tool: string): boolean {
  if (tool === "python_calculator") return true
  return BUDDY_CUSTOM_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix))
}

export function toToolStatus(value: unknown): "pending" | "running" | "completed" | "error" {
  if (value === "running") return "running"
  if (value === "completed") return "completed"
  if (value === "error") return "error"
  return "pending"
}
