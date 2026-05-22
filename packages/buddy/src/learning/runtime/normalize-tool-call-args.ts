export function normalizeToolCallArgs(value: unknown): unknown {
  if (typeof value !== "string") {
    return value
  }

  const trimmed = value.trim()
  if (
    !(trimmed.startsWith("{") && trimmed.endsWith("}")) &&
    !(trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}
