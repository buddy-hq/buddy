import { createStore } from "zustand/vanilla"
import { readCompactionAuto, readToolToggle } from "./project-config-readers"
import type { TBuddyConfigObject } from "./parse-external"
import type { GeneralSettingsBundle } from "./general-settings-query"

export type GeneralSettingsDraft = {
  fullTextReadingEnabled: boolean
  autoCompactionEnabled: boolean
}

type GeneralSettingsState = {
  saving: boolean
  error?: string
  draft: GeneralSettingsDraft
  initialized?: string
}

export const FULL_TEXT_TOOL_ID = "ingest_full_text"

const EMPTY_DRAFT: GeneralSettingsDraft = {
  fullTextReadingEnabled: true,
  autoCompactionEnabled: true,
}

export function buildGeneralSettingsDraft(globalConfig: TBuddyConfigObject): GeneralSettingsDraft {
  return {
    fullTextReadingEnabled: readToolToggle(globalConfig, FULL_TEXT_TOOL_ID, true),
    autoCompactionEnabled: readCompactionAuto(globalConfig, true),
  }
}

type GeneralSettingsStoreState = GeneralSettingsState & {
  initializeFromBundle: (initialized: string, bundle: GeneralSettingsBundle) => void
  startSaving: () => void
  finishSaving: (error?: string) => void
  failSaving: (errorMessage: string) => void
  setError: (error?: string) => void
  setFullTextReadingEnabled: (fullTextReadingEnabled: boolean) => void
  setAutoCompactionEnabled: (autoCompactionEnabled: boolean) => void
}

function emptyGeneralSettingsState(): GeneralSettingsState {
  return {
    saving: false,
    error: undefined,
    draft: { ...EMPTY_DRAFT },
    initialized: undefined,
  }
}

export function createGeneralSettingsStore() {
  return createStore<GeneralSettingsStoreState>()((set, get) => ({
    ...emptyGeneralSettingsState(),
    initializeFromBundle(initialized, bundle) {
      if (get().initialized === initialized) {
        return
      }

      set({
        saving: false,
        error: undefined,
        draft: buildGeneralSettingsDraft(bundle.globalConfig),
        initialized,
      })
    },
    startSaving() {
      set({
        saving: true,
        error: undefined,
      })
    },
    finishSaving(error) {
      set({
        saving: false,
        error,
      })
    },
    failSaving(errorMessage) {
      set({
        saving: false,
        error: errorMessage,
      })
    },
    setError(error) {
      set({ error })
    },
    setFullTextReadingEnabled(fullTextReadingEnabled) {
      set((current) => ({
        draft: {
          ...current.draft,
          fullTextReadingEnabled,
        },
      }))
    },
    setAutoCompactionEnabled(autoCompactionEnabled) {
      set((current) => ({
        draft: {
          ...current.draft,
          autoCompactionEnabled,
        },
      }))
    },
  }))
}

export type GeneralSettingsStore = ReturnType<typeof createGeneralSettingsStore>
