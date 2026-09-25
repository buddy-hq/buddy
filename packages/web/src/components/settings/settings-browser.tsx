import {
  IN_APP_BROWSER_ZOOM_FACTORS,
  parseInAppBrowserAppearance,
  parseInAppBrowserZoomFactor,
} from "@buddy/browser-contract"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@buddy/ui"
import { usePlatform } from "@/context/platform"
import {
  IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS,
  parseInAppBrowserSearchEngine,
} from "@/lib/in-app-browser-search"
import { parseInAppBrowserLinkTarget } from "@/lib/in-app-browser-settings"
import {
  flushInAppBrowserSettings,
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsHydrated,
  useInAppBrowserSettingsHydrationStatus,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"
import { markOneTimeNoticeSeen, ONE_TIME_NOTICE_LINK_DESTINATION } from "@/state/one-time-notices"
import { BrowserProfilesSection } from "./settings-browser-profiles"
import { SettingsContent, SettingsRow, SettingsSection } from "./settings-primitives"

type SelectOption = { readonly value: string; readonly label: string }

const ZOOM_OPTIONS: readonly SelectOption[] = IN_APP_BROWSER_ZOOM_FACTORS.map((zoomFactor) => ({
  value: String(zoomFactor),
  label: `${Math.round(zoomFactor * 100)}%`,
}))

const APPEARANCE_OPTIONS: readonly SelectOption[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const SEARCH_ENGINE_OPTIONS: readonly SelectOption[] = IN_APP_BROWSER_SEARCH_ENGINE_OPTIONS.map(
  (engine) => ({ value: engine.id, label: engine.label }),
)

const LINK_TARGET_OPTIONS: readonly SelectOption[] = [
  { value: "system", label: "Default browser" },
  { value: "browser", label: "Buddy" },
]

function flushBrowserDefault(input: { isCurrent: () => boolean; revert: () => void }): void {
  void flushInAppBrowserSettings().then((saved) => {
    if (saved) return
    if (input.isCurrent()) {
      input.revert()
      void flushInAppBrowserSettings()
    }
    toast.error("Could not save Browser defaults")
  })
}

function BrowserSettingSelect(props: {
  label: string
  value: string
  options: readonly SelectOption[]
  disabled: boolean
  onValueChange: (value: string) => void
}) {
  return (
    <Select value={props.value} disabled={props.disabled} onValueChange={props.onValueChange}>
      <SelectTrigger aria-label={props.label} className="w-full sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function BrowserDefaultsSection() {
  const settingsHydrated = useInAppBrowserSettingsHydrated()
  const defaultSearchEngine = useInAppBrowserSettingsStore((state) => state.defaultSearchEngine)
  const defaultZoomFactor = useInAppBrowserSettingsStore((state) => state.defaultZoomFactor)
  const defaultAppearance = useInAppBrowserSettingsStore((state) => state.defaultAppearance)

  return (
    <SettingsSection title="Defaults">
      <SettingsRow
        title="Search engine"
        description="Used for searches from New tab and the address bar."
        control={
          <BrowserSettingSelect
            label="Default search engine"
            value={defaultSearchEngine}
            options={SEARCH_ENGINE_OPTIONS}
            disabled={!settingsHydrated}
            onValueChange={(value) => {
              const searchEngine = parseInAppBrowserSearchEngine(value)
              if (searchEngine) {
                const store = useInAppBrowserSettingsStore.getState()
                const previous = store.defaultSearchEngine
                store.setDefaultSearchEngine(searchEngine)
                flushBrowserDefault({
                  isCurrent: () =>
                    useInAppBrowserSettingsStore.getState().defaultSearchEngine === searchEngine,
                  revert: () =>
                    useInAppBrowserSettingsStore.getState().setDefaultSearchEngine(previous),
                })
              }
            }}
          />
        }
      />
      <SettingsRow
        title="Zoom"
        description="Page zoom applied to new browser tabs."
        control={
          <BrowserSettingSelect
            label="Default browser zoom"
            value={String(defaultZoomFactor)}
            options={ZOOM_OPTIONS}
            disabled={!settingsHydrated}
            onValueChange={(value) => {
              const zoomFactor = parseInAppBrowserZoomFactor(Number(value))
              if (zoomFactor !== undefined) {
                const store = useInAppBrowserSettingsStore.getState()
                const previous = store.defaultZoomFactor
                store.setDefaultZoomFactor(zoomFactor)
                flushBrowserDefault({
                  isCurrent: () =>
                    useInAppBrowserSettingsStore.getState().defaultZoomFactor === zoomFactor,
                  revert: () =>
                    useInAppBrowserSettingsStore.getState().setDefaultZoomFactor(previous),
                })
              }
            }}
          />
        }
      />
      <SettingsRow
        title="Appearance"
        description="The color scheme pages are told to prefer. System follows your OS setting."
        control={
          <BrowserSettingSelect
            label="Default browser appearance"
            value={defaultAppearance}
            options={APPEARANCE_OPTIONS}
            disabled={!settingsHydrated}
            onValueChange={(value) => {
              const appearance = parseInAppBrowserAppearance(value)
              if (appearance) {
                const store = useInAppBrowserSettingsStore.getState()
                const previous = store.defaultAppearance
                store.setDefaultAppearance(appearance)
                flushBrowserDefault({
                  isCurrent: () =>
                    useInAppBrowserSettingsStore.getState().defaultAppearance === appearance,
                  revert: () =>
                    useInAppBrowserSettingsStore.getState().setDefaultAppearance(previous),
                })
              }
            }}
          />
        }
      />
    </SettingsSection>
  )
}

function BrowserLinksSection() {
  const settingsHydrated = useInAppBrowserSettingsHydrated()
  const linkTarget = useInAppBrowserSettingsStore((state) => state.linkTarget)
  const modifiedLinkTarget = useInAppBrowserSettingsStore((state) => state.modifiedLinkTarget)
  const modifierClick = usePlatform().os === "macos" ? "Cmd-click" : "Ctrl-click"

  return (
    <SettingsSection title="Links">
      <SettingsRow
        title="Click a link"
        description="In chats, documents, PDFs and books."
        control={
          <BrowserSettingSelect
            label="Click a link"
            value={linkTarget}
            options={LINK_TARGET_OPTIONS}
            disabled={!settingsHydrated}
            onValueChange={(value) => {
              const target = parseInAppBrowserLinkTarget(value)
              if (target) {
                markOneTimeNoticeSeen(ONE_TIME_NOTICE_LINK_DESTINATION)
                const store = useInAppBrowserSettingsStore.getState()
                const previous = {
                  linkTarget: store.linkTarget,
                  modifiedLinkTarget: store.modifiedLinkTarget,
                }
                store.setLinkTarget(target)
                flushBrowserDefault({
                  isCurrent: () => useInAppBrowserSettingsStore.getState().linkTarget === target,
                  revert: () => {
                    const current = useInAppBrowserSettingsStore.getState()
                    current.setLinkTarget(previous.linkTarget)
                    current.setModifiedLinkTarget(previous.modifiedLinkTarget)
                  },
                })
              }
            }}
          />
        }
      />
      <SettingsRow
        title={`${modifierClick} a link`}
        description="In chats, documents, PDFs and books."
        control={
          <BrowserSettingSelect
            label={`${modifierClick} a link`}
            value={modifiedLinkTarget}
            options={LINK_TARGET_OPTIONS}
            disabled={!settingsHydrated}
            onValueChange={(value) => {
              const target = parseInAppBrowserLinkTarget(value)
              if (target) {
                const store = useInAppBrowserSettingsStore.getState()
                const previous = store.modifiedLinkTarget
                store.setModifiedLinkTarget(target)
                flushBrowserDefault({
                  isCurrent: () =>
                    useInAppBrowserSettingsStore.getState().modifiedLinkTarget === target,
                  revert: () =>
                    useInAppBrowserSettingsStore.getState().setModifiedLinkTarget(previous),
                })
              }
            }}
          />
        }
      />
      <SettingsRow
        title={`${modifierClick} a link on a web page in Buddy`}
        description="Always stays in Buddy. Right-click a link to open it in your default browser."
        control={<p className="w-full px-3 text-sm text-text-weak sm:w-40">New Buddy tab</p>}
      />
    </SettingsSection>
  )
}

export function BrowserSettings() {
  const browser = usePlatform().inAppBrowser
  const hydrationStatus = useInAppBrowserSettingsHydrationStatus()
  if (!browser) return null

  if (hydrationStatus === "failed") {
    return (
      <SettingsContent>
        <div role="alert" className="space-y-3 rounded-lg border border-border-base p-4">
          <p className="text-sm text-text-weak">Browser settings could not be loaded.</p>
          <Button variant="outline" onClick={() => void retryInAppBrowserSettingsHydration()}>
            Try again
          </Button>
        </div>
      </SettingsContent>
    )
  }

  return (
    <SettingsContent>
      <BrowserProfilesSection browser={browser} />
      <BrowserDefaultsSection />
      <BrowserLinksSection />
    </SettingsContent>
  )
}
