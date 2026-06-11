import { useEffect, useState, useRef } from "react"
import type {
  FoliateReaderPreferences,
  FoliateReaderThemeId,
  FoliateReaderFlow,
  FoliateReaderSidebarTab,
} from "../foliate-reader-types"
import { FLOW_PAGINATED } from "../foliate-reader-constants"
import { loadGlobalPreferences, saveGlobalPreferences } from "../utils/foliate-storage"
import { syncMarginals } from "../utils/foliate-helpers"
import { applyReaderPreferences, getThemeDefinition } from "../utils/foliate-themes"

export interface UseFoliatePreferencesOptions {
  defaultTheme?: FoliateReaderThemeId
  defaultFlow?: FoliateReaderFlow
  defaultSidebarTab?: FoliateReaderSidebarTab
}

export interface UseFoliatePreferencesReturn {
  preferences: FoliateReaderPreferences
  setPreferences: React.Dispatch<React.SetStateAction<FoliateReaderPreferences>>
  effectiveAppearance: "light" | "dark"
  theme: FoliateReaderThemeId
  sidebarTab: FoliateReaderSidebarTab
  setSidebarTab: React.Dispatch<React.SetStateAction<FoliateReaderSidebarTab>>
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  showSidebar: boolean
}

export function useFoliatePreferences(
  options: UseFoliatePreferencesOptions = {},
  viewRef: React.MutableRefObject<any>,
  snapshotRef: React.MutableRefObject<any>,
  locationRef: React.MutableRefObject<any>,
  showSidebar: boolean = true,
): UseFoliatePreferencesReturn {
  const {
    defaultTheme = "paper",
    defaultFlow = FLOW_PAGINATED,
    defaultSidebarTab = "contents",
  } = options

  const [preferences, setPreferences] = useState(() =>
    loadGlobalPreferences(defaultTheme, defaultFlow),
  )
  const [sidebarTab, setSidebarTab] = useState<FoliateReaderSidebarTab>(defaultSidebarTab)
  const [sidebarOpen, setSidebarOpen] = useState(showSidebar)

  const preferencesRef = useRef(preferences)

  // Update refs when state changes
  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  // Sync sidebar with prop
  useEffect(() => {
    setSidebarOpen(showSidebar)
  }, [showSidebar])

  // Apply preferences to view and save to storage
  useEffect(() => {
    saveGlobalPreferences(preferences)
    const view = viewRef.current
    if (!view) return
    const theme = getThemeDefinition(preferences.themeId)
    applyReaderPreferences(view, theme, preferences)
    syncMarginals(view, snapshotRef.current, locationRef.current)
  }, [preferences, viewRef, snapshotRef, locationRef])

  return {
    preferences,
    setPreferences,
    effectiveAppearance: getThemeDefinition(preferences.themeId).appearance,
    theme: preferences.themeId,
    sidebarTab,
    setSidebarTab,
    sidebarOpen,
    setSidebarOpen,
    showSidebar,
  }
}
