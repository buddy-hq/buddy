import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"
import type { PromptAccessMode } from "../components/prompt/components/prompt-access-mode-select"
import { createPlatformJsonStorage } from "../context/platform"

export const CHAT_ACCESS_MODE_STORAGE_KEY = "buddy.chat-access-mode.v1"
const CHAT_ACCESS_MODE_STORAGE_FILE = "buddy.chat-access-mode.dat"
let changedBeforeHydration = false
let hydrationAttempt: Promise<boolean> = Promise.resolve(false)
let hydrationOutcome: boolean | undefined = false

type ChatAccessModeStore = {
  lastModeByDirectory: Record<string, PromptAccessMode>
  setLastMode: (directory: string, mode: PromptAccessMode) => void
}

const persistedStateSchema = z.object({
  lastModeByDirectory: z.record(
    z.string(),
    z.enum(["supervised", "default", "full"]).catch("default"),
  ),
})

export const useChatAccessModeStore = create<ChatAccessModeStore>()(
  persist(
    (set, _get, api) => ({
      lastModeByDirectory: {},
      setLastMode(directory, mode) {
        if (!api.persist.hasHydrated()) changedBeforeHydration = true
        set((state) => ({
          lastModeByDirectory: { ...state.lastModeByDirectory, [directory]: mode },
        }))
      },
    }),
    {
      name: CHAT_ACCESS_MODE_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage(CHAT_ACCESS_MODE_STORAGE_FILE),
      partialize: (state) => ({ lastModeByDirectory: state.lastModeByDirectory }),
      onRehydrateStorage: () => {
        let finish: ((success: boolean) => void) | undefined
        hydrationOutcome = undefined
        hydrationAttempt = new Promise<boolean>((resolve) => {
          finish = (success) => {
            hydrationOutcome = success
            resolve(success)
          }
        })
        return async (state, error) => {
          if (!state || error !== undefined) {
            finish?.(false)
            return
          }
          try {
            if (changedBeforeHydration) {
              const { storage, name, version } = useChatAccessModeStore.persist.getOptions()
              if (!storage || !name) {
                finish?.(false)
                return
              }
              await storage.setItem(name, {
                state: { lastModeByDirectory: state.lastModeByDirectory },
                version,
              })
              changedBeforeHydration = false
            }
            finish?.(true)
          } catch {
            finish?.(false)
          }
        }
      },
      merge(persistedState, currentState) {
        const parsed = persistedStateSchema.safeParse(persistedState)
        if (!parsed.success) return currentState
        return {
          ...currentState,
          lastModeByDirectory: {
            ...parsed.data.lastModeByDirectory,
            ...currentState.lastModeByDirectory,
          },
        }
      },
    },
  ),
)

export function waitForChatAccessModeHydration(): Promise<boolean> {
  if (hydrationOutcome === false) void useChatAccessModeStore.persist.rehydrate()
  return hydrationAttempt
}
