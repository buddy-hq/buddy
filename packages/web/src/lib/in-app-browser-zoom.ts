import {
  IN_APP_BROWSER_URL_MAX_LENGTH,
  parseInAppBrowserZoomFactor,
  type InAppBrowserZoomFactor,
} from "@buddy/browser-contract"
import {
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  parseInAppBrowserProfileID,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { parseTJsonObject } from "@/components/chat/tools/types"

const IN_APP_BROWSER_ZOOM_HOSTS_PER_PROFILE_MAX = 200
const IN_APP_BROWSER_ZOOM_PROTOCOLS = new Set(["http:", "https:"])
declare const inAppBrowserZoomHostBrand: unique symbol

export type InAppBrowserZoomHost = string & {
  readonly [inAppBrowserZoomHostBrand]: true
}

export type InAppBrowserZoomFactorsByProfile = Readonly<
  Record<string, Readonly<Record<string, InAppBrowserZoomFactor>>>
>

export function parseInAppBrowserZoomHost(value: string): InAppBrowserZoomHost | undefined {
  if (!value || value.length > IN_APP_BROWSER_URL_MAX_LENGTH) return undefined
  try {
    const url = new URL(value)
    if (!IN_APP_BROWSER_ZOOM_PROTOCOLS.has(url.protocol)) return undefined
    // SAFETY: URL.hostname is canonical for a parsed HTTP(S) URL, and this module is the only
    // constructor for the brand.
    return url.hostname as InAppBrowserZoomHost
  } catch {
    return undefined
  }
}

function parsePersistedInAppBrowserZoomHost(value: string): InAppBrowserZoomHost | undefined {
  const host = parseInAppBrowserZoomHost(`http://${value}`)
  return host === value ? host : undefined
}

function withoutProfile(
  factors: InAppBrowserZoomFactorsByProfile,
  profileID: InAppBrowserProfileID,
): InAppBrowserZoomFactorsByProfile {
  if (factors[profileID] === undefined) return factors
  return Object.fromEntries(Object.entries(factors).filter(([id]) => id !== profileID))
}

export function parseInAppBrowserZoomFactorsByProfile<TValue>(
  value: TValue,
  persistentProfileIDs: readonly InAppBrowserProfileID[],
) {
  const record = parseTJsonObject(value) ?? {}
  const allowedProfiles = new Set(persistentProfileIDs)
  const parsed: Record<string, Readonly<Record<string, InAppBrowserZoomFactor>>> = {}

  for (const [profileKey, hostsValue] of Object.entries(record)) {
    const profileID = parseInAppBrowserProfileID(profileKey)
    if (
      !profileID ||
      profileID === INCOGNITO_IN_APP_BROWSER_PROFILE_ID ||
      !allowedProfiles.has(profileID)
    ) {
      continue
    }
    const hosts = parseTJsonObject(hostsValue)
    if (!hosts) continue
    let parsedHosts: Readonly<Record<string, InAppBrowserZoomFactor>> = {}
    for (const [hostKey, factorValue] of Object.entries(hosts)) {
      const host = parsePersistedInAppBrowserZoomHost(hostKey)
      const zoomFactor = parseInAppBrowserZoomFactor(factorValue)
      if (!host || zoomFactor === undefined) continue
      parsedHosts = setInAppBrowserHostZoomFactor(parsedHosts, { host, zoomFactor })
    }
    if (Object.keys(parsedHosts).length > 0) parsed[profileID] = parsedHosts
  }

  return parsed
}

export function inAppBrowserHostZoomFactor(
  factors: InAppBrowserZoomFactorsByProfile,
  profileID: InAppBrowserProfileID,
  host: InAppBrowserZoomHost,
): InAppBrowserZoomFactor | undefined {
  return factors[profileID]?.[host]
}

function setInAppBrowserHostZoomFactor(
  factors: Readonly<Record<string, InAppBrowserZoomFactor>>,
  input: { readonly host: InAppBrowserZoomHost; readonly zoomFactor: InAppBrowserZoomFactor },
): Readonly<Record<string, InAppBrowserZoomFactor>> {
  if (factors[input.host] === input.zoomFactor) return factors
  const entries = [
    ...Object.entries(factors).filter(([host]) => host !== input.host),
    [input.host, input.zoomFactor] as const,
  ].slice(-IN_APP_BROWSER_ZOOM_HOSTS_PER_PROFILE_MAX)
  return Object.fromEntries(entries)
}

export function withInAppBrowserHostZoomFactor(
  factors: InAppBrowserZoomFactorsByProfile,
  input: {
    readonly profileID: InAppBrowserProfileID
    readonly host: InAppBrowserZoomHost
    readonly zoomFactor: InAppBrowserZoomFactor
  },
): InAppBrowserZoomFactorsByProfile {
  const current = factors[input.profileID] ?? {}
  const next = setInAppBrowserHostZoomFactor(current, input)
  return next === current ? factors : { ...factors, [input.profileID]: next }
}

export function withoutInAppBrowserHostZoomFactor(
  factors: InAppBrowserZoomFactorsByProfile,
  input: { readonly profileID: InAppBrowserProfileID; readonly host: InAppBrowserZoomHost },
): InAppBrowserZoomFactorsByProfile {
  const current = factors[input.profileID]
  if (current?.[input.host] === undefined) return factors
  const next = Object.fromEntries(Object.entries(current).filter(([host]) => host !== input.host))
  return Object.keys(next).length === 0
    ? withoutProfile(factors, input.profileID)
    : { ...factors, [input.profileID]: next }
}

export function withoutInAppBrowserProfileZoomFactors(
  factors: InAppBrowserZoomFactorsByProfile,
  profileID: InAppBrowserProfileID,
): InAppBrowserZoomFactorsByProfile {
  return withoutProfile(factors, profileID)
}
