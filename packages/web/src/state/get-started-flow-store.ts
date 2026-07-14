import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"

export const GET_STARTED_FLOW_STORAGE_KEY = "buddy.get-started-flow.v1"

export type GetStartedFlowStore = {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  dismiss: () => void
}

// Persisted app store: this owns the user's participation in the Get started flow.
export const useGetStartedFlowStore = create<GetStartedFlowStore>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled(enabled) {
        set({ enabled })
      },
      dismiss() {
        set({ enabled: false })
      },
    }),
    {
      name: GET_STARTED_FLOW_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage("buddy.get-started-flow.dat"),
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)

function subscribeToGetStartedFlowHydration(onStoreChange: () => void): () => void {
  const unsubscribeHydrate = useGetStartedFlowStore.persist.onHydrate(onStoreChange)
  const unsubscribeFinishHydration = useGetStartedFlowStore.persist.onFinishHydration(onStoreChange)

  return () => {
    unsubscribeHydrate()
    unsubscribeFinishHydration()
  }
}

function getStartedFlowHydrationSnapshot(): boolean {
  return useGetStartedFlowStore.persist.hasHydrated()
}

function getStartedFlowServerHydrationSnapshot(): boolean {
  return false
}

export function useGetStartedFlowStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToGetStartedFlowHydration,
    getStartedFlowHydrationSnapshot,
    getStartedFlowServerHydrationSnapshot,
  )
}
