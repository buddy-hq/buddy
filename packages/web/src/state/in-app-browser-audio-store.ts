import { create } from "zustand"

export type InAppBrowserTabAudio = {
  audible: boolean
  muted: boolean
}

type InAppBrowserAudioState = {
  byTabID: Record<string, InAppBrowserTabAudio>
  setAudible(tabID: string, audible: boolean): void
  toggleMuted(tabID: string): void
  removeTab(tabID: string): void
}

const SILENT_TAB: InAppBrowserTabAudio = { audible: false, muted: false }

export const useInAppBrowserAudioStore = create<InAppBrowserAudioState>((set) => ({
  byTabID: {},
  setAudible(tabID, audible) {
    set((state) => {
      const current = state.byTabID[tabID] ?? SILENT_TAB
      if (current.audible === audible) return state
      return { byTabID: { ...state.byTabID, [tabID]: { ...current, audible } } }
    })
  },
  toggleMuted(tabID) {
    set((state) => {
      const current = state.byTabID[tabID] ?? SILENT_TAB
      return { byTabID: { ...state.byTabID, [tabID]: { ...current, muted: !current.muted } } }
    })
  },
  removeTab(tabID) {
    set((state) => {
      if (!(tabID in state.byTabID)) return state
      const { [tabID]: _removed, ...byTabID } = state.byTabID
      return { byTabID }
    })
  },
}))
