const LOAD_ERROR_DESCRIPTIONS = new Map([
  ["ERR_NAME_NOT_RESOLVED", "DNS address could not be found"],
  ["ERR_NAME_RESOLUTION_FAILED", "DNS address could not be found"],
  ["ERR_CONNECTION_REFUSED", "Connection refused"],
  ["ERR_CONNECTION_RESET", "Connection was reset"],
  ["ERR_CONNECTION_CLOSED", "Connection was closed"],
  ["ERR_CONNECTION_TIMED_OUT", "Connection timed out"],
  ["ERR_INTERNET_DISCONNECTED", "No internet connection"],
  ["ERR_TIMED_OUT", "Connection timed out"],
  ["ERR_CERT_AUTHORITY_INVALID", "Certificate authority is not trusted"],
  ["ERR_CERT_COMMON_NAME_INVALID", "Certificate hostname mismatch"],
  ["ERR_CERT_DATE_INVALID", "Certificate is expired or not yet valid"],
  ["ERR_TOO_MANY_REDIRECTS", "Too many redirects"],
])

export function describeInAppBrowserLoadError(description: string): string {
  const normalized = description.replace(/^net::/u, "")
  return LOAD_ERROR_DESCRIPTIONS.get(normalized) ?? (normalized || "Network error")
}

export function inAppBrowserLoadErrorLabel(input: { code: number; description: string }): string {
  const normalized = input.description.replace(/^net::/u, "")
  return normalized || `ERR_${Math.abs(input.code) || "FAILED"}`
}
