import { describe, expect, test } from "bun:test"
import type {
  BrowserImportSource,
  BrowserImportUnavailableReason,
} from "@buddy/browser-contract/browser-import"
import { parseInAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import {
  browserImportOutcomeStep,
  canCloseBrowserImportWizard,
  fullDiskAccessRecheckStep,
  initialBrowserImportStep,
  initialBrowserImportTargetSelection,
  isListedBrowserImportSource,
  isRetryableBrowserImportReason,
  refreshedBrowserImportSourceProfileID,
  refreshedBrowserImportStep,
  resolveBrowserImportTarget,
} from "../src/lib/browser-import-wizard"

function profileID(value: string) {
  const id = parseInAppBrowserProfileID(value)
  if (!id) throw new Error(`Invalid test profile ID ${value}`)
  return id
}

function source(input: {
  profiles?: BrowserImportSource["profiles"]
  unavailable?: BrowserImportUnavailableReason
}): BrowserImportSource {
  return {
    id: "chrome",
    name: "Chrome",
    profiles: input.profiles ?? [{ id: "Default", name: "You" }],
    availability: input.unavailable
      ? { _tag: "unavailable", reason: input.unavailable }
      : { _tag: "available" },
  }
}

describe("browser import target selection", () => {
  test("starts on an existing profile when no new profile can be created", () => {
    const profiles = [{ id: profileID("new"), name: "Existing new" }]
    const selection = initialBrowserImportTargetSelection(false, profiles)

    expect(selection).toEqual({ _tag: "existing", profileID: profileID("new") })
    expect(resolveBrowserImportTarget(selection, profileID("generated"), profiles)).toEqual({
      _tag: "existing",
      profileID: profileID("new"),
      name: "Existing new",
    })
  })

  test("rejects an existing target that is no longer listed", () => {
    expect(
      resolveBrowserImportTarget(
        { _tag: "existing", profileID: profileID("removed") },
        profileID("generated"),
        [{ id: profileID("default"), name: "Default" }],
      ),
    ).toBeUndefined()
  })
})

describe("initial browser import step", () => {
  test("opens on the quit screen when the browser is running", () => {
    expect(initialBrowserImportStep(source({ unavailable: "browserRunning" }))).toEqual({
      _tag: "quit",
    })
  })

  test("opens on configure when the source is ready", () => {
    expect(initialBrowserImportStep(source({}))).toEqual({ _tag: "configure" })
  })

  test("asks for Full Disk Access before choosing an import target", () => {
    expect(
      initialBrowserImportStep(source({ profiles: [], unavailable: "needsFullDiskAccess" })),
    ).toEqual({ _tag: "fullDiskAccess", resume: "configure", checked: false })
  })

  test("blocks on a reason nothing local can fix", () => {
    expect(initialBrowserImportStep(source({ unavailable: "unsupportedPlatform" }))).toEqual({
      _tag: "blocked",
      reason: "unsupportedPlatform",
    })
  })

  test("blocks a ready source that reports no importable profiles", () => {
    expect(initialBrowserImportStep(source({ profiles: [] }))).toEqual({
      _tag: "blocked",
      reason: "unknownSourceProfile",
    })
  })
})

describe("browser import wizard transitions", () => {
  test("stays open while an import writes its target profile", () => {
    expect(canCloseBrowserImportWizard({ _tag: "importing" })).toBe(false)
    expect(canCloseBrowserImportWizard({ _tag: "configure" })).toBe(true)
  })

  test("lands on done after a successful import", () => {
    expect(
      browserImportOutcomeStep({
        _tag: "imported",
        imported: 12,
        skipped: 3,
        skippedDomains: ["example.test"],
        targetName: "Work",
      }),
    ).toEqual({
      _tag: "done",
      imported: 12,
      skipped: 3,
      skippedDomains: ["example.test"],
      targetName: "Work",
    })
  })

  test("routes a reopened browser and a Full Disk Access refusal to their own screens", () => {
    expect(browserImportOutcomeStep({ _tag: "blocked", reason: "browserRunning" })).toEqual({
      _tag: "quit",
    })
    expect(browserImportOutcomeStep({ _tag: "blocked", reason: "needsFullDiskAccess" })).toEqual({
      _tag: "fullDiskAccess",
      resume: "import",
      checked: true,
    })
    expect(browserImportOutcomeStep({ _tag: "blocked", reason: "readFailed" })).toEqual({
      _tag: "blocked",
      reason: "readFailed",
    })
  })

  test("re-checks a source after the user quits the browser or grants access", () => {
    expect(refreshedBrowserImportStep(source({}))).toEqual({ _tag: "configure" })
    expect(refreshedBrowserImportStep(undefined)).toEqual({
      _tag: "blocked",
      reason: "unknownSource",
    })
    expect(fullDiskAccessRecheckStep(source({ unavailable: "needsFullDiskAccess" }))).toEqual({
      _tag: "fullDiskAccess",
      resume: "configure",
      checked: true,
    })
  })

  test("keeps the chosen source profile when a refresh still lists it", () => {
    const refreshed = source({
      profiles: [
        { id: "Default", name: "Personal" },
        { id: "Profile 2", name: "Work" },
      ],
    })
    expect(refreshedBrowserImportSourceProfileID("Profile 2", refreshed)).toBe("Profile 2")
    expect(refreshedBrowserImportSourceProfileID("Removed", refreshed)).toBe("Default")
    expect(refreshedBrowserImportSourceProfileID("Removed", source({ profiles: [] }))).toBe("")
  })
})

describe("browser import failures", () => {
  test("offers a retry only when another attempt could succeed", () => {
    expect(isRetryableBrowserImportReason("needsKeychainApproval")).toBe(true)
    expect(isRetryableBrowserImportReason("keychainItemMissing")).toBe(true)
    expect(isRetryableBrowserImportReason("profileNotSaved")).toBe(true)
    expect(isRetryableBrowserImportReason("unsupportedPlatform")).toBe(false)
    expect(isRetryableBrowserImportReason("profileLimitReached")).toBe(false)
  })

  test("lists only sources the user can act on", () => {
    expect(isListedBrowserImportSource(source({}))).toBe(true)
    expect(isListedBrowserImportSource(source({ unavailable: "browserRunning" }))).toBe(true)
    expect(isListedBrowserImportSource(source({ unavailable: "notInstalled" }))).toBe(false)
    expect(isListedBrowserImportSource(source({ unavailable: "unsupportedPlatform" }))).toBe(false)
  })
})
