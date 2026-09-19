export const BROWSER_IMPORT_SOURCE_IDS = ["chrome", "edge", "safari"] as const

export type BrowserImportSourceID = (typeof BROWSER_IMPORT_SOURCE_IDS)[number]

export type BrowserImportSourceProfile = {
  readonly id: string
  readonly name: string
  readonly cookieCount?: number
}

export type BrowserImportUnavailableReason =
  | "notInstalled"
  | "needsKeychainApproval"
  | "keychainItemMissing"
  | "needsFullDiskAccess"
  | "browserRunning"
  | "unsupportedPlatform"

export type BrowserImportFailureReason =
  | BrowserImportUnavailableReason
  | "keychainUnavailable"
  | "unknownSource"
  | "unknownSourceProfile"
  | "sessionUnavailable"
  | "profileNotSaved"
  | "profileLimitReached"
  | "appBoundEncryptionUnsupported"
  | "windowsDataProtectionUnavailable"
  | "readFailed"

export type BrowserImportSource = {
  readonly id: BrowserImportSourceID
  readonly name: string
  readonly profiles: readonly BrowserImportSourceProfile[]
  readonly availability:
    | { readonly _tag: "available" }
    | { readonly _tag: "unavailable"; readonly reason: BrowserImportUnavailableReason }
}

export type BrowserImportRequest = {
  readonly sourceID: BrowserImportSourceID
  readonly sourceProfileID: string
  readonly profileID: string
}

export type BrowserImportResult =
  | {
      readonly _tag: "imported"
      readonly imported: number
      readonly skipped: number
      readonly skippedDomains: readonly string[]
    }
  | { readonly _tag: "failed"; readonly reason: BrowserImportFailureReason }

const BROWSER_IMPORT_REASON_DESCRIPTIONS = {
  notInstalled: "This browser isn't installed on this computer.",
  needsKeychainApproval: "Allow Keychain access when macOS asks, then try again.",
  keychainItemMissing: "The browser's cookie key isn't in your Keychain. Open that browser once, then try again.",
  needsFullDiskAccess:
    "Give Buddy Full Disk Access in System Settings > Privacy & Security, then try again.",
  browserRunning: "Quit the browser first so its cookies can be read.",
  unsupportedPlatform: "Importing from this browser isn't supported on this computer.",
  keychainUnavailable: "The system's password store couldn't be reached. Try again.",
  unknownSource: "That browser is no longer available to import from.",
  unknownSourceProfile: "That browser profile no longer exists.",
  sessionUnavailable: "The Buddy browser profile couldn't be opened.",
  profileNotSaved: "The cookies were imported, but the new profile couldn't be saved. Try again.",
  profileLimitReached: "You've reached the profile limit. Delete a profile or import into an existing one.",
  appBoundEncryptionUnsupported:
    "This browser protects its cookies with Windows App-Bound Encryption, so another app can't import them. Sign in manually in Buddy instead.",
  windowsDataProtectionUnavailable:
    "Windows couldn't decrypt this browser's cookie key. Use the same Windows account that created the browser profile, then try again.",
  readFailed: "The browser's cookies couldn't be read.",
} as const satisfies Record<BrowserImportFailureReason, string>

export function parseBrowserImportSourceID<TValue>(value: TValue): BrowserImportSourceID | undefined {
  return BROWSER_IMPORT_SOURCE_IDS.find((id) => id === value)
}

export function describeBrowserImportReason(reason: BrowserImportFailureReason): string {
  return BROWSER_IMPORT_REASON_DESCRIPTIONS[reason]
}
