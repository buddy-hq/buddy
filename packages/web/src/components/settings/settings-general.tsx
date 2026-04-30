import { useMemo, useState } from "react"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useGeneralSettings } from "@/state/general-settings"
import { showDesktopUpdateToast } from "@/lib/desktop-updates"
import { useTheme, type ColorScheme } from "@/theme"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"
import type { SettingsWorkbench } from "./settings-workbench"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

export function GeneralSettings({ workbench }: { workbench: SettingsWorkbench }) {
  const platform = usePlatform()
  const generalSettings = useGeneralSettings({
    cleanupDirectories: workbench.openDirectories,
  })
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()

  const colorSchemeOptions: ReadonlyArray<{ value: ColorScheme; label: string }> = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  const themeOptions = useMemo(
    () =>
      Object.entries(themes).map(([id, theme]) => ({
        id,
        name: theme.name,
      })),
    [themes],
  )

  const showDesktopUpdateControls =
    platform.platform === "desktop" &&
    !!platform.checkUpdate &&
    !!platform.update &&
    !!platform.restart

  async function onCheckForUpdates() {
    if (
      platform.platform !== "desktop" ||
      !platform.checkUpdate ||
      !platform.update ||
      !platform.restart
    ) {
      return
    }

    setCheckingForUpdates(true)
    const result = await platform
      .checkUpdate()
      .catch(() => ({ status: "error", stage: "check" }) as const)
    setCheckingForUpdates(false)

    switch (result.status) {
      case "ready":
        showDesktopUpdateToast({ platform, version: result.version })
        return
      case "up-to-date":
        toast(language.t("settings.appearance.upToDate"))
        return
      case "disabled":
        toast(language.t("settings.appearance.updatesUnavailable"))
        return
      case "error":
        toast.error(
          result.stage === "download"
            ? language.t("settings.appearance.updateDownloadFailed")
            : language.t("settings.appearance.updateCheckFailed"),
        )
    }
  }

  return (
    <SettingsContent
      title={language.t("settings.general.title")}
      description={language.t("settings.general.description")}
    >
      <SettingsListCard>
        <SettingsRow
          title={language.t("settings.appearance.colorSchemeTitle")}
          description={language.t("settings.appearance.colorSchemeDescription")}
          control={
            <Select
              value={colorScheme}
              onValueChange={(value) => {
                if (isColorScheme(value)) {
                  setColorScheme(value)
                }
              }}
            >
              <SelectTrigger data-action="settings-color-scheme" className="w-full">
                <SelectValue
                  placeholder={language.t("settings.appearance.colorSchemePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {colorSchemeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={language.t("settings.general.fullTextTitle")}
          description="Allow Buddy to read an entire prepared resource into context when there is enough live context budget. Turn this off to avoid expensive full-book reads."
          control={
            <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
              <span className="text-sm text-text-weak">
                {generalSettings.selection.fullTextReadingEnabled
                  ? language.t("settings.notebook.on")
                  : language.t("settings.notebook.off")}
              </span>
              <Switch
                data-action="settings-global-full-text"
                checked={generalSettings.selection.fullTextReadingEnabled}
                onCheckedChange={generalSettings.actions.setFullTextReadingEnabled}
                disabled={generalSettings.status.loading}
                aria-label={language.t("settings.general.fullTextAria")}
              />
            </div>
          }
        />
        <SettingsRow
          title={language.t("settings.general.autoCompactionTitle")}
          description="Automatically compact the session when context reaches the model limit window. Turn this off to keep full history and compact manually with slash commands."
          control={
            <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
              <span className="text-sm text-text-weak">
                {generalSettings.selection.autoCompactionEnabled
                  ? language.t("settings.notebook.on")
                  : language.t("settings.notebook.off")}
              </span>
              <Switch
                data-action="settings-global-auto-compaction"
                checked={generalSettings.selection.autoCompactionEnabled}
                onCheckedChange={generalSettings.actions.setAutoCompactionEnabled}
                disabled={generalSettings.status.loading}
                aria-label={language.t("settings.general.autoCompactionAria")}
              />
            </div>
          }
        />
        <SettingsRow
          title={language.t("settings.appearance.themeTitle")}
          description={language.t("settings.appearance.themeDescription")}
          last={!showDesktopUpdateControls}
          control={
            <Select value={themeId} onValueChange={setTheme}>
              <SelectTrigger data-action="settings-theme" className="w-full">
                <SelectValue placeholder={language.t("settings.appearance.themePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {showDesktopUpdateControls ? (
          <SettingsRow
            title={language.t("settings.appearance.updatesTitle")}
            description={language.t("settings.appearance.updatesDescription")}
            last
            control={
              <Button
                data-action="settings-check-updates"
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void onCheckForUpdates()}
                disabled={checkingForUpdates}
              >
                {checkingForUpdates
                  ? language.t("settings.appearance.checking")
                  : language.t("settings.appearance.checkForUpdates")}
              </Button>
            }
          />
        ) : null}
      </SettingsListCard>
    </SettingsContent>
  )
}
