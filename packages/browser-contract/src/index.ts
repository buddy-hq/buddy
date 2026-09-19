// Kept for compatibility with the browser runtime already present on main. The profile-aware
// runtime in the follow-up PR resolves named partitions through the profile contract instead.
export const IN_APP_BROWSER_PARTITION = "persist:buddy-browser"
export const IN_APP_BROWSER_BLANK_URL = "about:blank"
export const IN_APP_BROWSER_NEW_TAB_TITLE = "New tab"
export const IN_APP_BROWSER_WEB_PREFERENCES =
  "contextIsolation=true,sandbox=true,nodeIntegration=false"
export const IN_APP_BROWSER_DOWNLOAD_BLOCKED_MESSAGE = "Downloads are not supported yet."
export const IN_APP_BROWSER_EXTERNAL_LINK_BLOCKED_MESSAGE = "This link cannot open another app yet."
export const IN_APP_BROWSER_TITLE_MAX_LENGTH = 200
export const IN_APP_BROWSER_URL_MAX_LENGTH = 8_192
export const IN_APP_BROWSER_FAVICON_DATA_URL_MAX_LENGTH = 8_192
export const IN_APP_BROWSER_MESSAGE_CHANNEL = "inapp-browser-message"
export const IN_APP_BROWSER_FAVICON_CHANNEL = "inapp-browser-favicon"
export const IN_APP_BROWSER_AUDIO_CHANNEL = "inapp-browser-audio"
export const IN_APP_BROWSER_SHORTCUT_CHANNEL = "inapp-browser-shortcut"
export type InAppBrowserMouseNavigation = {
  readonly direction: "back" | "forward"
}

type AppShortcutDefinition = {
  readonly key: string
  readonly code: string
  readonly mod: true
  readonly alt?: true
  readonly shift?: true
}

/**
 * Canonical application shortcuts shared by the renderer and Electron guest views.
 * `mod` means Command on macOS and Control on Windows/Linux.
 */
export const APP_SHORTCUTS = {
  "chat.new": { key: "n", code: "KeyN", mod: true },
  "chat.previous": { key: "[", code: "BracketLeft", mod: true, shift: true },
  "chat.next": { key: "]", code: "BracketRight", mod: true, shift: true },
  "chat.jump.1": { key: "1", code: "Digit1", mod: true },
  "chat.jump.2": { key: "2", code: "Digit2", mod: true },
  "chat.jump.3": { key: "3", code: "Digit3", mod: true },
  "chat.jump.4": { key: "4", code: "Digit4", mod: true },
  "chat.jump.5": { key: "5", code: "Digit5", mod: true },
  "chat.jump.6": { key: "6", code: "Digit6", mod: true },
  "chat.jump.7": { key: "7", code: "Digit7", mod: true },
  "chat.jump.8": { key: "8", code: "Digit8", mod: true },
  "chat.jump.9": { key: "9", code: "Digit9", mod: true },
  "composer.focus": { key: "l", code: "KeyL", mod: true },
  "search.open": { key: "f", code: "KeyF", mod: true, shift: true },
  "bench.toggle": { key: "b", code: "KeyB", mod: true, alt: true },
  "browser.newTab": { key: "t", code: "KeyT", mod: true },
  "sidebar.toggle": { key: "b", code: "KeyB", mod: true },
} as const satisfies Record<string, AppShortcutDefinition>

/** Stable identifier for a canonical application shortcut. */
export type AppShortcutID = keyof typeof APP_SHORTCUTS

/** Operating-system convention used to resolve the shortcut's primary modifier. */
export type AppShortcutPlatform = "macos" | "windows" | "linux"

/** Keyboard input fields shared by DOM and Electron input events. */
export type AppShortcutInput = {
  readonly type: string
  readonly key: string
  readonly code: string
  readonly isAutoRepeat: boolean
  readonly isComposing: boolean
  readonly shift: boolean
  readonly control: boolean
  readonly alt: boolean
  readonly meta: boolean
}

function appShortcutEntries() {
  // SAFETY: Object.entries preserves the keys and corresponding values of this closed const object.
  return Object.entries(APP_SHORTCUTS) as [AppShortcutID, AppShortcutDefinition][]
}

function appShortcutKeyMatches(
  input: Pick<AppShortcutInput, "key" | "code">,
  shortcut: AppShortcutDefinition,
): boolean {
  const keyMatches =
    input.key.length === 1 &&
    shortcut.key.length === 1 &&
    input.key.toLowerCase() === shortcut.key.toLowerCase()
  return keyMatches || input.code === shortcut.code
}

function isPrimaryModifierChord(input: AppShortcutInput, platform: AppShortcutPlatform): boolean {
  if (input.type !== "keyDown" || input.isAutoRepeat || input.isComposing) return false
  const primaryIsMeta = platform === "macos"
  return input.meta === primaryIsMeta && input.control !== primaryIsMeta
}

/**
 * Resolve an Electron guest keydown into an app shortcut. Repeats and IME composition stay with
 * the guest page, matching the renderer's keyboard policy.
 */
export function resolveAppShortcutID(
  input: AppShortcutInput,
  platform: AppShortcutPlatform,
): AppShortcutID | undefined {
  if (!isPrimaryModifierChord(input, platform)) return undefined

  for (const [id, shortcut] of appShortcutEntries()) {
    if (input.shift !== !!shortcut.shift || input.alt !== !!shortcut.alt) continue
    if (appShortcutKeyMatches(input, shortcut)) return id
  }
  return undefined
}

export type InAppBrowserShortcutID = "reload" | "focusAddress" | "zoomIn" | "zoomOut" | "zoomReset"

export function resolveInAppBrowserShortcutID(
  input: AppShortcutInput,
  platform: AppShortcutPlatform,
): InAppBrowserShortcutID | undefined {
  if (!isPrimaryModifierChord(input, platform) || input.alt) return undefined
  const key = input.key.toLowerCase()
  if (input.code === "Equal" || input.code === "NumpadAdd" || key === "=" || key === "+") {
    return "zoomIn"
  }
  if (input.shift) return undefined
  if (input.code === "KeyR" || key === "r") return "reload"
  if (input.code === "KeyL" || key === "l") return "focusAddress"
  if (input.code === "Minus" || input.code === "NumpadSubtract" || key === "-") return "zoomOut"
  if (input.code === "Digit0" || input.code === "Numpad0" || key === "0") return "zoomReset"
  return undefined
}

export const IN_APP_BROWSER_ZOOM_FACTORS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const

export type InAppBrowserZoomFactor = (typeof IN_APP_BROWSER_ZOOM_FACTORS)[number]

export const DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR: InAppBrowserZoomFactor = 1

export function parseInAppBrowserZoomFactor<TValue>(
  value: TValue,
): InAppBrowserZoomFactor | undefined {
  return IN_APP_BROWSER_ZOOM_FACTORS.find((factor) => factor === value)
}

export function stepInAppBrowserZoomFactor(
  current: InAppBrowserZoomFactor,
  direction: "in" | "out",
): InAppBrowserZoomFactor {
  const index = IN_APP_BROWSER_ZOOM_FACTORS.indexOf(current)
  const next = direction === "in" ? index + 1 : index - 1
  return IN_APP_BROWSER_ZOOM_FACTORS[next] ?? current
}

export type InAppBrowserAppearance = "system" | "light" | "dark"

export const DEFAULT_IN_APP_BROWSER_APPEARANCE: InAppBrowserAppearance = "system"

export function parseInAppBrowserAppearance<TValue>(
  value: TValue,
): InAppBrowserAppearance | undefined {
  if (value === "system") return "system"
  if (value === "light") return "light"
  if (value === "dark") return "dark"
  return undefined
}

export type InAppBrowserFavicon = {
  dataUrl: string
  pageUrl: string
  capturedAt: number
}

export type InAppBrowserFaviconMessage = {
  webContentsID: number
  favicon: InAppBrowserFavicon
}

export type InAppBrowserHostMessage = {
  webContentsID: number
  message: string
}

export type InAppBrowserAudioMessage = {
  webContentsID: number
  audible: boolean
}

export type InAppBrowserShortcutMessage = {
  webContentsID: number
  shortcut: InAppBrowserShortcutID
}

export type InAppBrowserCommandResult =
  | { readonly _tag: "done" }
  | {
      readonly _tag: "failed"
      readonly reason: "invalid-request" | "tab-unavailable" | "operation-failed"
    }

export type InAppBrowserProfileData = "cookies" | "cache" | "everything"

export type InAppBrowserAppearanceRequest = {
  webContentsID: number
  appearance: InAppBrowserAppearance
}

export type InAppBrowserClearProfileDataRequest = {
  profileID: string
  data: InAppBrowserProfileData
}

const IN_APP_BROWSER_PROTOCOLS = new Set(["http:", "https:"])
const LOCAL_DEVELOPMENT_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::", "::1"])

function hasExplicitProtocol(value: string): boolean {
  const match = /^[a-z][a-z\d+.-]*:(.*)$/iu.exec(value)
  if (!match) return false
  const remainder = match[1] ?? ""
  if (remainder.startsWith("//")) return true
  return !/^\d+(?:[/?#]|$)/u.test(remainder)
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
}

function parseIpv4Address(hostname: string): readonly number[] | undefined {
  const parts = hostname.split(".").map(Number)
  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : undefined
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  if (LOCAL_DEVELOPMENT_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")) {
    return true
  }
  return parseIpv4Address(normalized)?.[0] === 127
}

function bareAddressProtocol(value: string): "http" | "https" {
  try {
    const hostname = new URL(`http://${value}`).hostname
    return isLocalDevelopmentHostname(hostname) ? "http" : "https"
  } catch {
    return "https"
  }
}

export function normalizeInAppBrowserUrl(value: string): string | undefined {
  const address = value.trim()
  if (!address || address.length > IN_APP_BROWSER_URL_MAX_LENGTH) return undefined

  const candidate = hasExplicitProtocol(address)
    ? address
    : `${bareAddressProtocol(address)}://${address}`
  try {
    const url = new URL(candidate)
    return IN_APP_BROWSER_PROTOCOLS.has(url.protocol) &&
      url.href.length <= IN_APP_BROWSER_URL_MAX_LENGTH
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function isAllowedInAppBrowserUrl(value: string): boolean {
  if (value.length > IN_APP_BROWSER_URL_MAX_LENGTH) return false
  try {
    return IN_APP_BROWSER_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function isInAppBrowserTargetUrl(value: string): boolean {
  return value === IN_APP_BROWSER_BLANK_URL || isAllowedInAppBrowserUrl(value)
}

export function inAppBrowserFallbackTitle(url: string): string {
  if (!url || url === IN_APP_BROWSER_BLANK_URL) return IN_APP_BROWSER_NEW_TAB_TITLE
  try {
    return new URL(url).hostname || IN_APP_BROWSER_NEW_TAB_TITLE
  } catch {
    return IN_APP_BROWSER_NEW_TAB_TITLE
  }
}

export function normalizeInAppBrowserTitle(title: string, url: string): string {
  if (!url || url === IN_APP_BROWSER_BLANK_URL) return IN_APP_BROWSER_NEW_TAB_TITLE
  const normalized = title
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
  return (normalized || inAppBrowserFallbackTitle(url)).slice(0, IN_APP_BROWSER_TITLE_MAX_LENGTH)
}

export function inAppBrowserDisplayUrl(url: string): string {
  return url === IN_APP_BROWSER_BLANK_URL ? "" : url
}
