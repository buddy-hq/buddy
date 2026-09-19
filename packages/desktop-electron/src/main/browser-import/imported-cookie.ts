export type CookieSameSite = "unspecified" | "no_restriction" | "lax" | "strict"

export type ImportedCookie = {
  readonly url: string
  readonly name: string
  readonly value: string
  readonly domain: string | undefined
  readonly path: string
  readonly secure: boolean
  readonly httpOnly: boolean
  readonly expirationDate: number | undefined
  readonly sameSite: CookieSameSite
}

export type CookieStoreContents = {
  readonly cookies: readonly ImportedCookie[]
  readonly skipped: number
  readonly skippedDomains: readonly string[]
}

export type CookieStoreRead<TReason extends string> =
  | { readonly _tag: "read"; readonly contents: CookieStoreContents }
  | { readonly _tag: "failed"; readonly reason: TReason; readonly cause?: unknown }

// Engines mark domain cookies with a leading dot. Electron re-adds it for any `domain`, so
// host-only cookies omit it or they would widen to subdomains and reject `__Host-` names.
export type CookieScope = { readonly url: string; readonly domain: string | undefined }

export function cookieScope(host: string, path: string, secure: boolean): CookieScope {
  const isDomainCookie = host.startsWith(".")
  const bareHost = isDomainCookie ? host.slice(1) : host
  const authority =
    bareHost.includes(":") && !(bareHost.startsWith("[") && bareHost.endsWith("]"))
      ? `[${bareHost}]`
      : bareHost
  return {
    url: `${secure ? "https" : "http"}://${authority}${path}`,
    domain: isDomainCookie ? host : undefined,
  }
}
