export function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

export function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

export function readToolToggle(input: Record<string, unknown>, toolId: string, fallback: boolean) {
  const tools = readRecord(input, "tools")
  const value = tools?.[toolId]
  return typeof value === "boolean" ? value : fallback
}

export function readCompactionAuto(input: Record<string, unknown>, fallback: boolean) {
  const compaction = readRecord(input, "compaction")
  const value = compaction?.auto
  return typeof value === "boolean" ? value : fallback
}
