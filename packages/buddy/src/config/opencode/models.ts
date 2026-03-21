function parseConfiguredModel(value: unknown):
  | {
      providerID: string
      modelID: string
    }
  | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const [providerID, ...rest] = trimmed.split("/")

  return {
    providerID,
    modelID: rest.join("/"),
  }
}

export { parseConfiguredModel }
