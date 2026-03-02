function parseConfiguredModel(
  value: unknown,
): {
  providerID: string
  modelID: string
} | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator >= trimmed.length - 1) return undefined

  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  }
}

export { parseConfiguredModel }
