import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import type { OnboardingAuthChoice } from "@/components/onboarding"
import { parseBooleanValue, parseBuddyConfigObject, parseStringValue } from "./parse-external"

export const ONBOARDING_STORAGE_KEY = "buddy.onboarding.v1"
const ONBOARDING_STORAGE_VERSION = 3 as const

type TOnboardingStore = {
  setupCompleted: boolean
  authChoice?: OnboardingAuthChoice
  setAuthChoice: (choice: OnboardingAuthChoice) => void
  markSetupCompleted: () => void
  reset: () => void
}

const DEFAULT_STATE = {
  setupCompleted: false,
  authChoice: undefined,
} satisfies {
  setupCompleted: boolean
  authChoice: OnboardingAuthChoice | undefined
}

function parseOnboardingAuthChoice<TValue>(value: TValue): OnboardingAuthChoice | undefined {
  const text = parseStringValue(value)
  if (text === "chatgpt_plus" || text === "free_models") return text
  return undefined
}

function migrateOnboardingState<TValue>(persistedState: TValue) {
  const state = parseBuddyConfigObject(persistedState) ?? {}
  const setupCompleted =
    parseBooleanValue(state.setupCompleted) ?? parseBooleanValue(state.completed) ?? false

  return {
    setupCompleted,
    authChoice: parseOnboardingAuthChoice(state.authChoice),
  }
}

export const useOnboardingStore = create<TOnboardingStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setAuthChoice(authChoice) {
        set({ authChoice })
      },
      markSetupCompleted() {
        set({
          setupCompleted: true,
          authChoice: undefined,
        })
      },
      reset() {
        set(DEFAULT_STATE)
      },
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: ONBOARDING_STORAGE_VERSION,
      storage: createPlatformJsonStorage("buddy.onboarding.dat"),
      migrate(persistedState) {
        return migrateOnboardingState(persistedState)
      },
      partialize(state) {
        return {
          setupCompleted: state.setupCompleted,
          authChoice: state.authChoice,
        }
      },
    },
  ),
)
