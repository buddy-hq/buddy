import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { parseBooleanValue, parseBuddyConfigObject, parseStringValue } from "@/state/parse-external"

export const DEVTOOLS_NAVIGATION_STORAGE_KEY = "buddy.devtools.navigation.v1"

export type BuddyDevToolsTab =
  | "palette"
  | "trace"
  | "context"
  | "system"
  | "snapshot"
  | "memory"
  | "query"
  | "actions"
  | "easel"
  | "prompt-engineering"
  | "tool-design"
  | "ui"
  | "transcript"
  | "evals"

export type EaselSectionID = "search" | "sources" | "practice" | "creations" | "boards" | "files"

/** Shared view mode for every prompt comparison in DevTools. */
export type PromptViewMode = "changes" | "context" | "full"

type DevToolsNavigationState = {
  buddyOpen: boolean
  activeTab: BuddyDevToolsTab
  promptComparisonID: string | undefined
  promptViewMode: PromptViewMode
  toolPromptID: string | undefined
  easelPrototypeID: string
  easelSection: EaselSectionID
  easelLotsOfContent: boolean
  setBuddyOpen: (open: boolean) => void
  toggleBuddyOpen: () => void
  setActiveTab: (tab: BuddyDevToolsTab) => void
  setPromptComparisonID: (id: string) => void
  setPromptViewMode: (mode: PromptViewMode) => void
  setToolPromptID: (id: string) => void
  setEaselPrototypeID: (id: string) => void
  setEaselSection: (section: EaselSectionID) => void
  setEaselLotsOfContent: (enabled: boolean) => void
}

export function isBuddyDevToolsTab(value: string): value is BuddyDevToolsTab {
  return (
    value === "palette" ||
    value === "trace" ||
    value === "context" ||
    value === "system" ||
    value === "snapshot" ||
    value === "memory" ||
    value === "query" ||
    value === "actions" ||
    value === "easel" ||
    value === "prompt-engineering" ||
    value === "tool-design" ||
    value === "ui" ||
    value === "transcript" ||
    value === "evals"
  )
}

function isEaselSectionID(value: string): value is EaselSectionID {
  return (
    value === "search" ||
    value === "sources" ||
    value === "practice" ||
    value === "creations" ||
    value === "boards" ||
    value === "files"
  )
}

function isPromptViewMode(value: string): value is PromptViewMode {
  return value === "changes" || value === "context" || value === "full"
}

function migrateLegacyPromptReviewID(id: string | undefined): string | undefined {
  // Earlier DevTools builds stored the whiteboard comparison IDs without their review prefix.
  if (id === "tool-selection" || id === "skill-guidance") return `whiteboard-selection/${id}`
  return undefined
}

// DevTools-only navigation state; production UI preferences are stored separately.
export const useDevToolsNavigation = create<DevToolsNavigationState>()(
  persist(
    (set) => ({
      buddyOpen: false,
      activeTab: "palette",
      promptComparisonID: undefined,
      promptViewMode: "context",
      toolPromptID: undefined,
      easelPrototypeID: "sent-message-motion",
      easelSection: "sources",
      easelLotsOfContent: false,
      setBuddyOpen: (buddyOpen) => set({ buddyOpen }),
      toggleBuddyOpen: () => set((state) => ({ buddyOpen: !state.buddyOpen })),
      setActiveTab: (activeTab) => set({ activeTab }),
      setPromptComparisonID: (promptComparisonID) => set({ promptComparisonID }),
      setPromptViewMode: (promptViewMode) => set({ promptViewMode }),
      setToolPromptID: (toolPromptID) => set({ toolPromptID }),
      setEaselPrototypeID: (easelPrototypeID) => set({ easelPrototypeID }),
      setEaselSection: (easelSection) => set({ easelSection }),
      setEaselLotsOfContent: (easelLotsOfContent) => set({ easelLotsOfContent }),
    }),
    {
      name: DEVTOOLS_NAVIGATION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ buddyOpen, activeTab, promptComparisonID, promptViewMode, toolPromptID, easelPrototypeID, easelSection, easelLotsOfContent }) => ({
        buddyOpen,
        activeTab,
        promptComparisonID,
        promptViewMode,
        toolPromptID,
        easelPrototypeID,
        easelSection,
        easelLotsOfContent,
      }),
      merge(persistedState, currentState) {
        const saved = parseBuddyConfigObject(persistedState)
        if (!saved) return currentState
        const buddyOpen = parseBooleanValue(saved.buddyOpen)
        const activeTab = parseStringValue(saved.activeTab)
        const promptComparisonID = parseStringValue(saved.promptComparisonID)
        const promptViewMode = parseStringValue(saved.promptViewMode)
        const legacyPromptReviewID = parseStringValue(saved.promptReviewID)
        const toolPromptID = parseStringValue(saved.toolPromptID)
        const easelPrototypeID = parseStringValue(saved.easelPrototypeID)
        const easelSection = parseStringValue(saved.easelSection)
        const easelLotsOfContent = parseBooleanValue(saved.easelLotsOfContent)
        return {
          ...currentState,
          buddyOpen: buddyOpen ?? currentState.buddyOpen,
          activeTab: activeTab && isBuddyDevToolsTab(activeTab) ? activeTab : currentState.activeTab,
          promptComparisonID:
            promptComparisonID ??
            migrateLegacyPromptReviewID(legacyPromptReviewID) ??
            currentState.promptComparisonID,
          promptViewMode: promptViewMode && isPromptViewMode(promptViewMode)
            ? promptViewMode
            : currentState.promptViewMode,
          toolPromptID: toolPromptID ?? currentState.toolPromptID,
          easelPrototypeID: easelPrototypeID ?? currentState.easelPrototypeID,
          easelSection: easelSection && isEaselSectionID(easelSection)
            ? easelSection
            : currentState.easelSection,
          easelLotsOfContent: easelLotsOfContent ?? currentState.easelLotsOfContent,
        }
      },
    },
  ),
)
