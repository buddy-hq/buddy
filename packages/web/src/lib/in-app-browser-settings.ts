import {
  DEFAULT_IN_APP_BROWSER_APPEARANCE,
  DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR,
  parseInAppBrowserAppearance,
  parseInAppBrowserZoomFactor,
  type InAppBrowserAppearance,
  type InAppBrowserZoomFactor,
} from "@buddy/browser-contract"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  IN_APP_BROWSER_PROFILE_MAX_COUNT,
  isBuiltInInAppBrowserProfileID,
  parseInAppBrowserProfileID,
  parseInAppBrowserProfileName,
  resolveInAppBrowserProfiles,
  type InAppBrowserProfile,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { parseTJsonObject } from "@/components/chat/tools/types"
import {
  DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE,
  parseInAppBrowserSearchEngine,
  type InAppBrowserSearchEngine,
} from "@/lib/in-app-browser-search"
import {
  parseInAppBrowserZoomFactorsByProfile,
  withoutInAppBrowserProfileZoomFactors,
  type InAppBrowserZoomFactorsByProfile,
} from "@/lib/in-app-browser-zoom"

export type InAppBrowserLinkTarget = "system" | "browser"

export type InAppBrowserSettings = {
  readonly linkTarget: InAppBrowserLinkTarget
  readonly defaultSearchEngine: InAppBrowserSearchEngine
  readonly defaultZoomFactor: InAppBrowserZoomFactor
  readonly zoomFactorsByProfile: InAppBrowserZoomFactorsByProfile
  readonly defaultAppearance: InAppBrowserAppearance
  readonly defaultProfileID: InAppBrowserProfileID
  readonly userProfiles: readonly InAppBrowserProfile[]
}

export const DEFAULT_IN_APP_BROWSER_SETTINGS: InAppBrowserSettings = {
  linkTarget: "system",
  defaultSearchEngine: DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE,
  defaultZoomFactor: DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR,
  zoomFactorsByProfile: {},
  defaultAppearance: DEFAULT_IN_APP_BROWSER_APPEARANCE,
  defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  userProfiles: [],
}

export type AddInAppBrowserProfileResult =
  | {
      readonly _tag: "added"
      readonly settings: InAppBrowserSettings
      readonly profile: InAppBrowserProfile
    }
  | { readonly _tag: "rejected"; readonly reason: "invalid-name" | "limit-reached" }

function parseUserProfiles<TValue>(value: TValue): readonly InAppBrowserProfile[] {
  if (!Array.isArray(value)) return []
  const profiles: InAppBrowserProfile[] = []
  for (const candidate of value) {
    const record = parseTJsonObject(candidate)
    const id = parseInAppBrowserProfileID(record?.id)
    const name = parseInAppBrowserProfileName(record?.name)
    if (!id || !name || isBuiltInInAppBrowserProfileID(id)) continue
    if (profiles.some((profile) => profile.id === id)) continue
    profiles.push({ id, name })
  }
  return profiles.slice(0, IN_APP_BROWSER_PROFILE_MAX_COUNT)
}

export function canUseAsDefaultInAppBrowserProfile(
  userProfiles: readonly InAppBrowserProfile[],
  id: InAppBrowserProfileID,
): boolean {
  return (
    id !== INCOGNITO_IN_APP_BROWSER_PROFILE_ID &&
    resolveInAppBrowserProfiles(userProfiles).some((profile) => profile.id === id)
  )
}

export function uniqueInAppBrowserProfileName(
  baseName: string,
  userProfiles: readonly InAppBrowserProfile[],
): string {
  const taken = new Set(resolveInAppBrowserProfiles(userProfiles).map((profile) => profile.name))
  let name = baseName
  for (let index = 2; taken.has(name); index += 1) name = `${baseName} ${index}`
  return name
}

export function newTabInAppBrowserProfiles(
  userProfiles: readonly InAppBrowserProfile[],
  defaultProfileID: InAppBrowserProfileID,
): readonly InAppBrowserProfile[] {
  const rank = (profile: InAppBrowserProfile) => {
    if (profile.id === defaultProfileID) return 0
    return profile.id === INCOGNITO_IN_APP_BROWSER_PROFILE_ID ? 2 : 1
  }
  return resolveInAppBrowserProfiles(userProfiles).toSorted(
    (left, right) => rank(left) - rank(right),
  )
}

export function parseInAppBrowserSettings<TValue>(value: TValue): InAppBrowserSettings {
  const record = parseTJsonObject(value)
  if (!record) return DEFAULT_IN_APP_BROWSER_SETTINGS
  const userProfiles = parseUserProfiles(record.userProfiles)
  const defaultProfileID = parseInAppBrowserProfileID(record.defaultProfileID)
  const persistentProfileIDs = [
    DEFAULT_IN_APP_BROWSER_PROFILE_ID,
    ...userProfiles.map((profile) => profile.id),
  ]
  return {
    linkTarget: record.linkTarget === "browser" ? "browser" : "system",
    defaultSearchEngine:
      parseInAppBrowserSearchEngine(record.defaultSearchEngine) ??
      DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE,
    defaultZoomFactor:
      parseInAppBrowserZoomFactor(record.defaultZoomFactor) ?? DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR,
    zoomFactorsByProfile: parseInAppBrowserZoomFactorsByProfile(
      record.zoomFactorsByProfile,
      persistentProfileIDs,
    ),
    defaultAppearance:
      parseInAppBrowserAppearance(record.defaultAppearance) ?? DEFAULT_IN_APP_BROWSER_APPEARANCE,
    defaultProfileID:
      defaultProfileID && canUseAsDefaultInAppBrowserProfile(userProfiles, defaultProfileID)
        ? defaultProfileID
        : DEFAULT_IN_APP_BROWSER_PROFILE_ID,
    userProfiles,
  }
}

export function addInAppBrowserProfile(
  settings: InAppBrowserSettings,
  input: { id: string; name: string },
): AddInAppBrowserProfileResult {
  const id = parseInAppBrowserProfileID(input.id)
  const name = parseInAppBrowserProfileName(input.name)
  if (!id || !name || isBuiltInInAppBrowserProfileID(id)) {
    return { _tag: "rejected", reason: "invalid-name" }
  }
  if (settings.userProfiles.length >= IN_APP_BROWSER_PROFILE_MAX_COUNT) {
    return { _tag: "rejected", reason: "limit-reached" }
  }
  const profile = { id, name }
  return {
    _tag: "added",
    profile,
    settings: { ...settings, userProfiles: [...settings.userProfiles, profile] },
  }
}

export function renameInAppBrowserProfile(
  settings: InAppBrowserSettings,
  input: { id: InAppBrowserProfileID; name: string },
): InAppBrowserSettings {
  const name = parseInAppBrowserProfileName(input.name)
  if (!name || !settings.userProfiles.some((profile) => profile.id === input.id)) return settings
  return {
    ...settings,
    userProfiles: settings.userProfiles.map((profile) =>
      profile.id === input.id ? { ...profile, name } : profile,
    ),
  }
}

export function removeInAppBrowserProfile(
  settings: InAppBrowserSettings,
  id: InAppBrowserProfileID,
): InAppBrowserSettings {
  if (!settings.userProfiles.some((profile) => profile.id === id)) return settings
  return {
    ...settings,
    userProfiles: settings.userProfiles.filter((profile) => profile.id !== id),
    zoomFactorsByProfile: withoutInAppBrowserProfileZoomFactors(settings.zoomFactorsByProfile, id),
    defaultProfileID:
      settings.defaultProfileID === id
        ? DEFAULT_IN_APP_BROWSER_PROFILE_ID
        : settings.defaultProfileID,
  }
}
