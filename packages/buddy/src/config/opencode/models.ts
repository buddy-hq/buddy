import { parseConfigString, type TConfiguredModel } from "../parse-values.js"

function parseConfiguredModel<TValue>(value: TValue): TConfiguredModel | undefined {
  const parsed = parseConfigString(value)
  if (parsed === undefined) return undefined
  const trimmed = parsed.trim()
  if (!trimmed) return undefined

  const [providerID, ...rest] = trimmed.split("/")
  if (providerID === undefined) return undefined

  return {
    providerID,
    modelID: rest.join("/"),
  }
}

export { parseConfiguredModel }
export type { TConfiguredModel }
