function matchesOrigin(url: string, origin: string) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export function shouldInjectBackendAuth(input: {
  requestUrl: string
  isAppWindow: boolean
  isMainFrame: boolean
  resourceType: string
  origin: string
  requestHeaders: Readonly<Record<string, string>>
}): boolean {
  if (!matchesOrigin(input.requestUrl, input.origin)) return false
  if (!input.isAppWindow || !input.isMainFrame || input.resourceType === "subFrame") return false

  return !Object.keys(input.requestHeaders).some((header) => header.toLowerCase() === "authorization")
}
