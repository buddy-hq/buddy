const DEFAULT_PARTITION = "persist:buddy-browser"
// No `persist:` prefix, so Chromium discards it on quit.
const INCOGNITO_PARTITION = "buddy-browser-incognito"
const PROFILE_PARTITION_PREFIX = "persist:buddy-browser-profile-"
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u

export const IN_APP_BROWSER_PROFILE_NAME_MAX_LENGTH = 48
export const IN_APP_BROWSER_PROFILE_MAX_COUNT = 24

export type InAppBrowserProfileID = string & { readonly __brand: "InAppBrowserProfileID" }

export type InAppBrowserProfile = {
  readonly id: InAppBrowserProfileID
  readonly name: string
}

function parseString<TValue>(value: TValue): string | undefined {
  return Object.prototype.toString.call(value) === "[object String]" ? `${value}` : undefined
}

function brandProfileID(value: string): InAppBrowserProfileID {
  // SAFETY: Callers pass either a literal built-in ID or a string that matched PROFILE_ID_PATTERN.
  return value as InAppBrowserProfileID
}

export const DEFAULT_IN_APP_BROWSER_PROFILE_ID = brandProfileID("default")

export const INCOGNITO_IN_APP_BROWSER_PROFILE_ID = brandProfileID("incognito")

export const BUILT_IN_IN_APP_BROWSER_PROFILES: readonly InAppBrowserProfile[] = [
  { id: DEFAULT_IN_APP_BROWSER_PROFILE_ID, name: "Default" },
  { id: INCOGNITO_IN_APP_BROWSER_PROFILE_ID, name: "Incognito" },
]

export function createInAppBrowserProfileID(): InAppBrowserProfileID {
  return brandProfileID(crypto.randomUUID())
}

export function parseInAppBrowserProfileID<TValue>(
  value: TValue,
): InAppBrowserProfileID | undefined {
  const text = parseString(value)
  return text !== undefined && PROFILE_ID_PATTERN.test(text) ? brandProfileID(text) : undefined
}

export function parseInAppBrowserProfileName<TValue>(value: TValue): string | undefined {
  const text = parseString(value)
  if (text === undefined) return undefined
  const name = text.trim()
  return name.length > 0 &&
    name.length <= IN_APP_BROWSER_PROFILE_NAME_MAX_LENGTH &&
    !CONTROL_CHARACTERS.test(name)
    ? name
    : undefined
}

export function isBuiltInInAppBrowserProfileID(id: InAppBrowserProfileID): boolean {
  return BUILT_IN_IN_APP_BROWSER_PROFILES.some((profile) => profile.id === id)
}

export function inAppBrowserProfilePartition(id: InAppBrowserProfileID): string {
  if (id === DEFAULT_IN_APP_BROWSER_PROFILE_ID) return DEFAULT_PARTITION
  if (id === INCOGNITO_IN_APP_BROWSER_PROFILE_ID) return INCOGNITO_PARTITION
  return `${PROFILE_PARTITION_PREFIX}${id}`
}

export function parseInAppBrowserPartition(partition: string): InAppBrowserProfileID | undefined {
  if (partition === DEFAULT_PARTITION) return DEFAULT_IN_APP_BROWSER_PROFILE_ID
  if (partition === INCOGNITO_PARTITION) return INCOGNITO_IN_APP_BROWSER_PROFILE_ID
  if (!partition.startsWith(PROFILE_PARTITION_PREFIX)) return undefined
  const id = parseInAppBrowserProfileID(partition.slice(PROFILE_PARTITION_PREFIX.length))
  return id && !isBuiltInInAppBrowserProfileID(id) ? id : undefined
}

export function resolveInAppBrowserProfiles(
  userProfiles: readonly InAppBrowserProfile[],
): readonly InAppBrowserProfile[] {
  const seen = new Set<string>(BUILT_IN_IN_APP_BROWSER_PROFILES.map((profile) => profile.id))
  const resolved = [...BUILT_IN_IN_APP_BROWSER_PROFILES]
  for (const profile of userProfiles) {
    if (seen.has(profile.id)) continue
    seen.add(profile.id)
    resolved.push(profile)
  }
  return resolved
}
