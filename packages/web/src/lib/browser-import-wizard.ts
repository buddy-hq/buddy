import type {
  BrowserImportFailureReason,
  BrowserImportSource,
} from "@buddy/browser-contract/browser-import"
import type { InAppBrowserProfile, InAppBrowserProfileID } from "@buddy/browser-contract/profiles"

export type BrowserImportTarget =
  | { readonly _tag: "new"; readonly profileID: InAppBrowserProfileID }
  | { readonly _tag: "existing"; readonly profileID: InAppBrowserProfileID; readonly name: string }

export type BrowserImportTargetSelection =
  | { readonly _tag: "new" }
  | { readonly _tag: "existing"; readonly profileID: InAppBrowserProfileID }

export type BrowserImportOutcome =
  | {
      readonly _tag: "imported"
      readonly imported: number
      readonly skipped: number
      readonly skippedDomains: readonly string[]
      readonly targetName: string
    }
  | { readonly _tag: "blocked"; readonly reason: BrowserImportFailureReason }

export type BrowserImportWizardStep =
  | { readonly _tag: "quit" }
  | {
      readonly _tag: "fullDiskAccess"
      readonly resume: "configure" | "import"
      readonly checked: boolean
    }
  | { readonly _tag: "configure" }
  | { readonly _tag: "checking"; readonly check: "browser" | "fullDiskAccess" }
  | { readonly _tag: "importing" }
  | {
      readonly _tag: "done"
      readonly imported: number
      readonly skipped: number
      readonly skippedDomains: readonly string[]
      readonly targetName: string
    }
  | { readonly _tag: "blocked"; readonly reason: BrowserImportFailureReason }

const RETRYABLE_REASONS: ReadonlySet<BrowserImportFailureReason> = new Set([
  "needsKeychainApproval",
  "keychainItemMissing",
  "keychainUnavailable",
  "readFailed",
  "sessionUnavailable",
  "profileNotSaved",
])

export function initialBrowserImportTargetSelection(
  canCreateProfile: boolean,
  targetProfiles: readonly InAppBrowserProfile[],
): BrowserImportTargetSelection {
  const first = targetProfiles[0]
  if (canCreateProfile || !first) return { _tag: "new" }
  return { _tag: "existing", profileID: first.id }
}

export function resolveBrowserImportTarget(
  selection: BrowserImportTargetSelection,
  newProfileID: InAppBrowserProfileID,
  targetProfiles: readonly InAppBrowserProfile[],
): BrowserImportTarget | undefined {
  if (selection["_tag"] === "new") return { _tag: "new", profileID: newProfileID }
  const profile = targetProfiles.find((candidate) => candidate.id === selection.profileID)
  return profile ? { _tag: "existing", profileID: profile.id, name: profile.name } : undefined
}

export function canCloseBrowserImportWizard(step: BrowserImportWizardStep): boolean {
  return step["_tag"] !== "importing"
}

export function initialBrowserImportStep(source: BrowserImportSource): BrowserImportWizardStep {
  const { availability } = source
  if (availability["_tag"] === "unavailable") {
    if (availability.reason === "browserRunning") return { _tag: "quit" }
    if (availability.reason === "needsFullDiskAccess") {
      return { _tag: "fullDiskAccess", resume: "configure", checked: false }
    }
    return { _tag: "blocked", reason: availability.reason }
  }
  if (source.profiles.length === 0) return { _tag: "blocked", reason: "unknownSourceProfile" }
  return { _tag: "configure" }
}

export function browserImportOutcomeStep(outcome: BrowserImportOutcome): BrowserImportWizardStep {
  if (outcome["_tag"] === "imported") {
    return {
      _tag: "done",
      imported: outcome.imported,
      skipped: outcome.skipped,
      skippedDomains: outcome.skippedDomains,
      targetName: outcome.targetName,
    }
  }
  if (outcome.reason === "browserRunning") return { _tag: "quit" }
  if (outcome.reason === "needsFullDiskAccess") {
    return { _tag: "fullDiskAccess", resume: "import", checked: true }
  }
  return { _tag: "blocked", reason: outcome.reason }
}

export function refreshedBrowserImportStep(
  source: BrowserImportSource | undefined,
): BrowserImportWizardStep {
  return source ? initialBrowserImportStep(source) : { _tag: "blocked", reason: "unknownSource" }
}

export function fullDiskAccessRecheckStep(
  source: BrowserImportSource | undefined,
): BrowserImportWizardStep {
  const next = refreshedBrowserImportStep(source)
  return next["_tag"] === "fullDiskAccess" ? { ...next, checked: true } : next
}

export function refreshedBrowserImportSourceProfileID(
  currentID: string,
  source: BrowserImportSource,
): string {
  if (source.profiles.some((profile) => profile.id === currentID)) return currentID
  return source.profiles[0]?.id ?? ""
}

export function isRetryableBrowserImportReason(reason: BrowserImportFailureReason): boolean {
  return RETRYABLE_REASONS.has(reason)
}

export function isListedBrowserImportSource(source: BrowserImportSource): boolean {
  const { availability } = source
  return (
    availability["_tag"] === "available" ||
    (availability.reason !== "notInstalled" && availability.reason !== "unsupportedPlatform")
  )
}
