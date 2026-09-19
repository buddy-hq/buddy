import { useCallback, useRef, useState } from "react"
import type {
  BrowserImportSource,
  BrowserImportSourceID,
} from "@buddy/browser-contract/browser-import"
import {
  resolveInAppBrowserProfiles,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "@/context/platform"
import type { BrowserImportOutcome, BrowserImportTarget } from "@/lib/browser-import-wizard"
import { uniqueInAppBrowserProfileName } from "@/lib/in-app-browser-settings"
import {
  flushInAppBrowserSettings,
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "@/state/in-app-browser-settings-store"

type ProfileRegistration =
  | { readonly _tag: "registered"; readonly name: string }
  | { readonly _tag: "rejected"; readonly reason: "profileLimitReached" | "profileNotSaved" }

function findProfile(profileID: InAppBrowserProfileID) {
  const { userProfiles } = useInAppBrowserSettingsStore.getState()
  return resolveInAppBrowserProfiles(userProfiles).find((profile) => profile.id === profileID)
}

function registerImportedProfile(
  source: BrowserImportSource,
  profileID: InAppBrowserProfileID,
): ProfileRegistration {
  const existing = findProfile(profileID)
  if (existing) return { _tag: "registered", name: existing.name }
  const settings = useInAppBrowserSettingsStore.getState()
  const result = settings.addProfile({
    id: profileID,
    name: uniqueInAppBrowserProfileName(source.name, settings.userProfiles),
  })
  if (result._tag === "added") return { _tag: "registered", name: result.profile.name }
  return {
    _tag: "rejected",
    reason: result.reason === "limit-reached" ? "profileLimitReached" : "profileNotSaved",
  }
}

export function useBrowserProfileImport(browser: InAppBrowserPlatform) {
  const [sources, setSources] = useState<readonly BrowserImportSource[] | null>(null)
  const [importing, setImporting] = useState(false)
  const importingRef = useRef(false)

  const loadSources = useCallback(() => {
    void browser
      .listImportSources()
      .then(setSources, (error) => {
        console.error("[browser-import] Could not list browser import sources", error)
        setSources((previous) => previous ?? [])
      })
  }, [browser])

  const refreshSource = useCallback(
    async (sourceID: BrowserImportSourceID) => {
      try {
        const latest = await browser.listImportSources()
        setSources(latest)
        return latest.find((source) => source.id === sourceID)
      } catch (error) {
        console.error("[browser-import] Could not refresh the browser import source", error)
        return undefined
      }
    },
    [browser],
  )

  const runImport = useCallback(
    async (
      source: BrowserImportSource,
      input: { sourceProfileID: string; target: BrowserImportTarget },
    ): Promise<BrowserImportOutcome> => {
      const { target } = input
      if (importingRef.current) return { _tag: "blocked", reason: "readFailed" }
      importingRef.current = true
      setImporting(true)
      try {
        if (!(await waitForInAppBrowserSettingsHydration())) {
          return { _tag: "blocked", reason: "readFailed" }
        }
        if (target._tag === "existing" && !findProfile(target.profileID)) {
          return { _tag: "blocked", reason: "readFailed" }
        }
        const result = await browser.importCookies({
          sourceID: source.id,
          sourceProfileID: input.sourceProfileID,
          profileID: target.profileID,
        })
        if (result._tag === "failed") return { _tag: "blocked", reason: result.reason }
        const imported = {
          _tag: "imported" as const,
          imported: result.imported,
          skipped: result.skipped,
          skippedDomains: result.skippedDomains,
        }
        if (target._tag === "existing") {
          return findProfile(target.profileID)
            ? { ...imported, targetName: target.name }
            : { _tag: "blocked", reason: "readFailed" }
        }
        if (result.imported === 0) return { ...imported, targetName: source.name }
        const registration = registerImportedProfile(source, target.profileID)
        if (registration._tag === "registered" && (await flushInAppBrowserSettings())) {
          return { ...imported, targetName: registration.name }
        }
        if (registration._tag === "registered") {
          useInAppBrowserSettingsStore.getState().removeProfile(target.profileID)
          await flushInAppBrowserSettings()
        }
        await browser
          .clearProfileData({ profileID: target.profileID, data: "everything" })
          .catch((error) => {
            console.error("[browser-import] Could not clean up the failed import target", error)
          })
        return {
          _tag: "blocked",
          reason: registration._tag === "registered" ? "profileNotSaved" : registration.reason,
        }
      } catch (error) {
        console.error("[browser-import] Import request failed", error)
        return { _tag: "blocked", reason: "readFailed" }
      } finally {
        importingRef.current = false
        setImporting(false)
      }
    },
    [browser],
  )

  return { sources, importing, loadSources, refreshSource, runImport }
}
