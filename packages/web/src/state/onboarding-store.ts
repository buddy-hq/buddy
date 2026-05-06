import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import type { OnboardingAuthChoice } from "@/components/onboarding"

const PERSONALIZATION_ONBOARDING_VERSION = 1 as const

export const ONBOARDING_STORAGE_KEY = "buddy.onboarding.v1"

type OnboardingStore = {
  setupCompleted: boolean
  activePersonalizationVersion: number | undefined
  personalizationVersionCompleted: number | undefined
  personalizationSkipped: boolean
  personalizationDirectory: string | undefined
  authChoice?: OnboardingAuthChoice
  setAuthChoice: (choice: OnboardingAuthChoice) => void
  startPersonalizationVersion: (directory: string) => void
  markSetupCompleted: () => void
  markPersonalizationCompleted: () => void
  markPersonalizationSkipped: () => void
  shouldShowPersonalizationStep: () => boolean
  reset: () => void
}

const DEFAULT_STATE: {
  setupCompleted: boolean
  activePersonalizationVersion: number | undefined
  personalizationVersionCompleted: number | undefined
  personalizationSkipped: boolean
  personalizationDirectory: string | undefined
  authChoice: OnboardingAuthChoice | undefined
} = {
  setupCompleted: false,
  activePersonalizationVersion: undefined,
  personalizationVersionCompleted: undefined,
  personalizationSkipped: false,
  personalizationDirectory: undefined,
  authChoice: undefined,
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      setAuthChoice(authChoice) {
        set({ authChoice })
      },
      startPersonalizationVersion(personalizationDirectory) {
        set((state) => {
          if (
            state.activePersonalizationVersion === PERSONALIZATION_ONBOARDING_VERSION &&
            state.personalizationDirectory === personalizationDirectory
          ) {
            return {}
          }

          return {
            activePersonalizationVersion: PERSONALIZATION_ONBOARDING_VERSION,
            personalizationDirectory,
          }
        })
      },
      markSetupCompleted() {
        set({
          setupCompleted: true,
        })
      },
      markPersonalizationCompleted() {
        set({
          activePersonalizationVersion: PERSONALIZATION_ONBOARDING_VERSION,
          personalizationVersionCompleted: PERSONALIZATION_ONBOARDING_VERSION,
          personalizationSkipped: false,
          personalizationDirectory: undefined,
          authChoice: undefined,
        })
      },
      markPersonalizationSkipped() {
        set({
          activePersonalizationVersion: PERSONALIZATION_ONBOARDING_VERSION,
          personalizationVersionCompleted: PERSONALIZATION_ONBOARDING_VERSION,
          personalizationSkipped: true,
          personalizationDirectory: undefined,
          authChoice: undefined,
        })
      },
      shouldShowPersonalizationStep(): boolean {
        const state = get()
        return (
          state.activePersonalizationVersion === PERSONALIZATION_ONBOARDING_VERSION &&
          state.personalizationVersionCompleted !== PERSONALIZATION_ONBOARDING_VERSION
        )
      },
      reset() {
        set(DEFAULT_STATE)
      },
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: 2,
      storage: createPlatformJsonStorage("buddy.onboarding.dat"),
      migrate(persistedState) {
        const state = (persistedState ?? {}) as Record<string, unknown>
        return {
          setupCompleted: typeof state.completed === "boolean" ? state.completed : false,
          activePersonalizationVersion: undefined,
          personalizationVersionCompleted: undefined,
          personalizationSkipped: false,
          personalizationDirectory: undefined,
          authChoice: state.authChoice as OnboardingAuthChoice | undefined,
        }
      },
      partialize(state) {
        return {
          setupCompleted: state.setupCompleted,
          activePersonalizationVersion: state.activePersonalizationVersion,
          personalizationVersionCompleted: state.personalizationVersionCompleted,
          personalizationSkipped: state.personalizationSkipped,
          personalizationDirectory: state.personalizationDirectory,
          authChoice: state.authChoice,
        }
      },
    },
  ),
)

export { PERSONALIZATION_ONBOARDING_VERSION }
