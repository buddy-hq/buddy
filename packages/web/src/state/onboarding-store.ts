import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import type { OnboardingAuthChoice } from "@/components/onboarding"

type OnboardingPhase = "splash" | "folder"

export const ONBOARDING_STORAGE_KEY = "buddy.onboarding.v1"

type OnboardingStore = {
  completed: boolean
  phase: OnboardingPhase
  authChoice?: OnboardingAuthChoice
  resumeDirectory?: string
  setPhase: (phase: OnboardingPhase) => void
  setAuthChoice: (choice: OnboardingAuthChoice) => void
  setResumeDirectory: (directory?: string) => void
  markCompleted: () => void
  reset: () => void
}

const DEFAULT_STATE: {
  completed: boolean
  phase: OnboardingPhase
  authChoice: OnboardingAuthChoice | undefined
  resumeDirectory: string | undefined
} = {
  completed: false,
  phase: "splash",
  authChoice: undefined,
  resumeDirectory: undefined,
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setPhase(phase) {
        set({ phase })
      },
      setAuthChoice(authChoice) {
        set({ authChoice })
      },
      setResumeDirectory(resumeDirectory) {
        set({ resumeDirectory })
      },
      markCompleted() {
        set({
          completed: true,
          phase: "splash",
          authChoice: undefined,
          resumeDirectory: undefined,
        })
      },
      reset() {
        set(DEFAULT_STATE)
      },
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage("buddy.onboarding.dat"),
      partialize(state) {
        return {
          completed: state.completed,
          phase: state.phase,
          authChoice: state.authChoice,
          resumeDirectory: state.resumeDirectory,
        }
      },
    },
  ),
)
