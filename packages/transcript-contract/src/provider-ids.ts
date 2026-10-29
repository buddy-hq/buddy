export function currentProviderID(providerID: string): string {
  if (providerID === "azure-cognitive-services") return "azure"
  if (providerID === "google-vertex-anthropic") return "google-vertex"
  return providerID
}
