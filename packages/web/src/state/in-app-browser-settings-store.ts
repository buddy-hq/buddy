import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { InAppBrowserAppearance, InAppBrowserZoomFactor } from "@buddy/browser-contract"
import {
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { createPlatformJsonStorage, getPlatform } from "@/context/platform"
import {
  addInAppBrowserProfile,
  canUseAsDefaultInAppBrowserProfile,
  DEFAULT_IN_APP_BROWSER_SETTINGS,
  parseInAppBrowserSettings,
  removeInAppBrowserProfile,
  renameInAppBrowserProfile,
  withInAppBrowserLinkTarget,
  type AddInAppBrowserProfileResult,
  type InAppBrowserLinkTarget,
  type InAppBrowserSettings,
} from "@/lib/in-app-browser-settings"
import type { InAppBrowserSearchEngine } from "@/lib/in-app-browser-search"
import {
  withInAppBrowserHostZoomFactor,
  withoutInAppBrowserHostZoomFactor,
  withoutInAppBrowserProfileZoomFactors,
  type InAppBrowserZoomHost,
} from "@/lib/in-app-browser-zoom"

const IN_APP_BROWSER_SETTINGS_STORAGE_KEY = "buddy.in-app-browser.v1"
const IN_APP_BROWSER_SETTINGS_STORAGE_FILE = "buddy.in-app-browser.dat"
const IN_APP_BROWSER_SETTINGS_HYDRATION_WAIT_MS = 2_000

export type InAppBrowserSettingsHydrationStatus = "hydrating" | "hydrated" | "failed"

let hydrationStatus: InAppBrowserSettingsHydrationStatus = "hydrating"
let hydrationAttempt = 0
let hydrationTimeout: ReturnType<typeof setTimeout> | undefined
const hydrationStatusListeners = new Set<() => void>()

function setHydrationStatus(status: InAppBrowserSettingsHydrationStatus): void {
  hydrationStatus = status
  for (const listener of hydrationStatusListeners) listener()
}

function beginHydration(): number {
  hydrationAttempt += 1
  const attempt = hydrationAttempt
  if (hydrationTimeout !== undefined) clearTimeout(hydrationTimeout)
  setHydrationStatus("hydrating")
  hydrationTimeout = setTimeout(() => {
    if (hydrationAttempt === attempt) setHydrationStatus("failed")
  }, IN_APP_BROWSER_SETTINGS_HYDRATION_WAIT_MS)
  return attempt
}

function finishHydration<TError>(attempt: number, error: TError): void {
  if (attempt !== hydrationAttempt) return
  if (hydrationTimeout !== undefined) clearTimeout(hydrationTimeout)
  hydrationTimeout = undefined
  setHydrationStatus(error ? "failed" : "hydrated")
}

type InAppBrowserSettingsState = InAppBrowserSettings & {
  setLinkTarget(linkTarget: InAppBrowserLinkTarget): void
  setModifiedLinkTarget(modifiedLinkTarget: InAppBrowserLinkTarget): void
  setDefaultSearchEngine(defaultSearchEngine: InAppBrowserSearchEngine): void
  setDefaultZoomFactor(defaultZoomFactor: InAppBrowserZoomFactor): void
  setHostZoomFactor(input: {
    profileID: InAppBrowserProfileID
    host: InAppBrowserZoomHost
    zoomFactor: InAppBrowserZoomFactor
  }): void
  clearHostZoomFactor(input: { profileID: InAppBrowserProfileID; host: InAppBrowserZoomHost }): void
  setDefaultAppearance(defaultAppearance: InAppBrowserAppearance): void
  setDefaultProfileID(defaultProfileID: InAppBrowserProfileID): void
  addProfile(input: { id: string; name: string }): AddInAppBrowserProfileResult
  renameProfile(input: { id: InAppBrowserProfileID; name: string }): void
  removeProfile(id: InAppBrowserProfileID): void
}

function settingsOf(state: InAppBrowserSettingsState): InAppBrowserSettings {
  return {
    linkTarget: state.linkTarget,
    modifiedLinkTarget: state.modifiedLinkTarget,
    defaultSearchEngine: state.defaultSearchEngine,
    defaultZoomFactor: state.defaultZoomFactor,
    zoomFactorsByProfile: state.zoomFactorsByProfile,
    defaultAppearance: state.defaultAppearance,
    defaultProfileID: state.defaultProfileID,
    userProfiles: state.userProfiles,
  }
}

function persistedSettingsOf(state: InAppBrowserSettingsState): InAppBrowserSettings {
  return {
    ...settingsOf(state),
    zoomFactorsByProfile: withoutInAppBrowserProfileZoomFactors(
      state.zoomFactorsByProfile,
      INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
    ),
  }
}

export const useInAppBrowserSettingsStore = create<InAppBrowserSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      setLinkTarget(linkTarget) {
        set((state) => withInAppBrowserLinkTarget(state, linkTarget))
      },
      setModifiedLinkTarget(modifiedLinkTarget) {
        set({ modifiedLinkTarget })
      },
      setDefaultSearchEngine(defaultSearchEngine) {
        set({ defaultSearchEngine })
      },
      setDefaultZoomFactor(defaultZoomFactor) {
        set({ defaultZoomFactor })
      },
      setHostZoomFactor(input) {
        set((state) => {
          const zoomFactorsByProfile = withInAppBrowserHostZoomFactor(
            state.zoomFactorsByProfile,
            input,
          )
          return zoomFactorsByProfile === state.zoomFactorsByProfile
            ? state
            : { zoomFactorsByProfile }
        })
      },
      clearHostZoomFactor(input) {
        set((state) => {
          const zoomFactorsByProfile = withoutInAppBrowserHostZoomFactor(
            state.zoomFactorsByProfile,
            input,
          )
          return zoomFactorsByProfile === state.zoomFactorsByProfile
            ? state
            : { zoomFactorsByProfile }
        })
      },
      setDefaultAppearance(defaultAppearance) {
        set({ defaultAppearance })
      },
      setDefaultProfileID(defaultProfileID) {
        if (!canUseAsDefaultInAppBrowserProfile(get().userProfiles, defaultProfileID)) return
        set({ defaultProfileID })
      },
      addProfile(input) {
        const result = addInAppBrowserProfile(settingsOf(get()), input)
        if (result["_tag"] === "added") set(result.settings)
        return result
      },
      renameProfile(input) {
        set(renameInAppBrowserProfile(settingsOf(get()), input))
      },
      removeProfile(id) {
        set(removeInAppBrowserProfile(settingsOf(get()), id))
      },
    }),
    {
      name: IN_APP_BROWSER_SETTINGS_STORAGE_KEY,
      storage: createPlatformJsonStorage(IN_APP_BROWSER_SETTINGS_STORAGE_FILE),
      partialize: persistedSettingsOf,
      merge: (persisted, current) => ({ ...current, ...parseInAppBrowserSettings(persisted) }),
      onRehydrateStorage: () => {
        const attempt = beginHydration()
        return (_state, error) => finishHydration(attempt, error)
      },
    },
  ),
)

function subscribeToInAppBrowserSettingsHydration(onStoreChange: () => void): () => void {
  hydrationStatusListeners.add(onStoreChange)
  return () => hydrationStatusListeners.delete(onStoreChange)
}

function inAppBrowserSettingsHydrationSnapshot(): boolean {
  return hydrationStatus === "hydrated"
}

function inAppBrowserSettingsServerHydrationSnapshot(): boolean {
  return false
}

function inAppBrowserSettingsHydrationStatusSnapshot(): InAppBrowserSettingsHydrationStatus {
  return hydrationStatus
}

function inAppBrowserSettingsServerHydrationStatusSnapshot(): InAppBrowserSettingsHydrationStatus {
  return "hydrating"
}

/** Reports whether persisted Browser settings have finished hydrating. */
export function useInAppBrowserSettingsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToInAppBrowserSettingsHydration,
    inAppBrowserSettingsHydrationSnapshot,
    inAppBrowserSettingsServerHydrationSnapshot,
  )
}

/** Reports the current persisted Browser settings hydration state. */
export function useInAppBrowserSettingsHydrationStatus(): InAppBrowserSettingsHydrationStatus {
  return useSyncExternalStore(
    subscribeToInAppBrowserSettingsHydration,
    inAppBrowserSettingsHydrationStatusSnapshot,
    inAppBrowserSettingsServerHydrationStatusSnapshot,
  )
}

/** Retries reading persisted Browser settings after a failed hydration. */
export async function retryInAppBrowserSettingsHydration(): Promise<void> {
  await useInAppBrowserSettingsStore.persist.rehydrate()
}

/** Waits for persisted Browser settings, returning false on read failure or timeout. */
export function waitForInAppBrowserSettingsHydration(): Promise<boolean> {
  if (hydrationStatus !== "hydrating") return Promise.resolve(hydrationStatus === "hydrated")

  return new Promise((resolve) => {
    const finish = () => {
      hydrationStatusListeners.delete(onStatusChange)
      resolve(hydrationStatus === "hydrated")
    }
    const onStatusChange = () => {
      if (hydrationStatus !== "hydrating") finish()
    }
    hydrationStatusListeners.add(onStatusChange)
    onStatusChange()
  })
}

/** Flushes Browser settings to durable platform storage when supported. */
export async function flushInAppBrowserSettings(): Promise<boolean> {
  const storage = getPlatform().storage?.(IN_APP_BROWSER_SETTINGS_STORAGE_FILE)
  if (!storage?.flush) return true
  try {
    await storage.flush()
    return true
  } catch {
    return false
  }
}
