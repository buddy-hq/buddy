function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : ""
}

export function readRecord(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!isRecord(value)) {
    return undefined
  }
  return value
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

export function readLearnerMemoryEnabled(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.enabled
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryMasterEnabled(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.master_enabled
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryAutoExtract(input: Record<string, unknown>, fallback: boolean) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.auto_extract
  return typeof value === "boolean" ? value : fallback
}

export function readLearnerMemoryNumber(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function readLearnerMemoryString(input: Record<string, unknown>, key: string) {
  const learnerMemory = readRecord(input, "learner_memory")
  const value = learnerMemory?.[key]
  return typeof value === "string" ? value : ""
}
