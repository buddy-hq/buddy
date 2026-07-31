import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import {
  DEFAULT_WHITEBOARD_PANEL_PLACEMENT,
  toggleWhiteboardPanelPlacement,
  type WhiteboardPanelPlacement,
} from "@/components/whiteboard/whiteboard-panel-placement"

export const WHITEBOARD_PREFERENCES_STORAGE_KEY = "buddy.whiteboard.v1"
export const WHITEBOARD_PREFERENCES_STORAGE_FILE = "buddy.whiteboard.dat"

type WhiteboardPreferencesState = {
  panelPlacement: WhiteboardPanelPlacement
  setPanelPlacement: (placement: WhiteboardPanelPlacement) => void
  togglePanelPlacement: () => void
}

export const useWhiteboardPreferences = create<WhiteboardPreferencesState>()(
  persist(
    (set) => ({
      panelPlacement: DEFAULT_WHITEBOARD_PANEL_PLACEMENT,
      setPanelPlacement(placement) {
        set({ panelPlacement: placement })
      },
      togglePanelPlacement() {
        set((state) => ({ panelPlacement: toggleWhiteboardPanelPlacement(state.panelPlacement) }))
      },
    }),
    {
      name: WHITEBOARD_PREFERENCES_STORAGE_KEY,
      storage: createPlatformJsonStorage(WHITEBOARD_PREFERENCES_STORAGE_FILE),
      partialize(state) {
        return {
          panelPlacement: state.panelPlacement,
        }
      },
    },
  ),
)
