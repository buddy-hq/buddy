/** Whether a URL belongs to the app's case-insensitive protocol. */
export function isAppDeepLink(url: string, protocol: string): boolean {
  try {
    return new URL(url).protocol.toLowerCase() === `${protocol}:`
  } catch {
    return false
  }
}
