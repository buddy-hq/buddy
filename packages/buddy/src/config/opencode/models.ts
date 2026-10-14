import { parseConfigString, type TConfiguredModel } from "../parse-values.js"

export function configuredProviderID(providerID: string): string {
  if (providerID === "azure-cognitive-services") return "azure"
  if (providerID === "google-vertex-anthropic") return "google-vertex"
  return providerID
}

function parseConfiguredModel<TValue>(value: TValue): TConfiguredModel | undefined {
  const parsed = parseConfigString(value)
  if (parsed === undefined) return undefined
  const trimmed = parsed.trim()
  if (!trimmed) return undefined

  const [providerID, ...rest] = trimmed.split("/")
  if (providerID === undefined) return undefined

  return {
    providerID: configuredProviderID(providerID),
    modelID: rest.join("/"),
  }
}

export { parseConfiguredModel }
export type { TConfiguredModel }
