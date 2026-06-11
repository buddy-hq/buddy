import { create } from "zustand"

const DEFAULT_MEDIA_VOLUME = 1
const DEFAULT_MEDIA_MUTED = false
const MIN_MEDIA_VOLUME = 0
const MAX_MEDIA_VOLUME = 1

function clampMediaVolume(volume: number) {
  return Math.min(MAX_MEDIA_VOLUME, Math.max(MIN_MEDIA_VOLUME, volume))
}

type PresentedMediaPlaybackStore = {
  loadedKeys: string[]
  playingKey: string | undefined
  volume: number
  muted: boolean
  ensureLoaded: (key: string) => void
  requestPlayback: (key: string) => void
  pausePlayback: (key: string) => void
  setVolumePreference: (volume: number) => void
  setMutedPreference: (muted: boolean) => void
}

export const usePresentedMediaPlaybackStore = create<PresentedMediaPlaybackStore>()((set) => ({
  loadedKeys: [],
  playingKey: undefined,
  volume: DEFAULT_MEDIA_VOLUME,
  muted: DEFAULT_MEDIA_MUTED,
  ensureLoaded(key) {
    set((state) => ({
      loadedKeys: state.loadedKeys.includes(key) ? state.loadedKeys : [...state.loadedKeys, key],
    }))
  },
  requestPlayback(key) {
    set({ playingKey: key })
  },
  pausePlayback(key) {
    set((state) => (state.playingKey === key ? { playingKey: undefined } : state))
  },
  setVolumePreference(volume) {
    const nextVolume = clampMediaVolume(volume)
    set({ volume: nextVolume, muted: nextVolume === 0 })
  },
  setMutedPreference(muted) {
    set({ muted })
  },
}))
