import { useMemo, useState } from "react"
import {
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  toast,
} from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { showDesktopUpdateToast } from "../../lib/desktop-updates"
import { useTheme, type ColorScheme } from "@/theme"
import { SettingsListCard, SettingsRow, SettingsContent } from "./settings-primitives"
import {
  advancedMathStatusLabel,
  formatRuntimeVersion,
  useAdvancedMathRuntime,
} from "./use-advanced-math-runtime"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

export function AppearanceSettings() {
  const platform = usePlatform()
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)

  const {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  } = useAdvancedMathRuntime({
    open: true,
    platform: platform.platform,
  })

  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()

  const colorSchemeOptions: { value: ColorScheme; label: string }[] = [
    { value: "system", label: language.t("settings.appearance.colorSchemes.system") },
    { value: "light", label: language.t("settings.appearance.colorSchemes.light") },
    { value: "dark", label: language.t("settings.appearance.colorSchemes.dark") },
  ]

  const themeOptions = useMemo(() => {
    return Object.entries(themes).map(([id, theme]) => ({
      id,
      name: theme.name,
    }))
  }, [themes])

  const showDesktopUpdateControls =
    platform.platform === "desktop" &&
    !!platform.checkUpdate &&
    !!platform.update &&
    !!platform.restart
  const showAdvancedMathControls = platform.platform === "desktop"

  async function onCheckForUpdates() {
    if (
      platform.platform !== "desktop" ||
      !platform.checkUpdate ||
      !platform.update ||
      !platform.restart
    )
      return
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
        return
    }
  }

  return (
    <>
      <SettingsContent
        title={language.t("settings.appearance.title")}
        description={language.t("settings.appearance.description")}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.appearance.themeSection")}
          </h3>
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.appearance.colorSchemeTitle")}
              description={language.t("settings.appearance.colorSchemeDescription")}
              control={
                <Select
                  value={colorScheme}
                  onValueChange={(value) => isColorScheme(value) && setColorScheme(value)}
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
              title={language.t("settings.appearance.themeTitle")}
              description={language.t("settings.appearance.themeDescription")}
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
          </SettingsListCard>
        </div>

        {showAdvancedMathControls || showDesktopUpdateControls ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.appearance.desktopSection")}
            </h3>
            <SettingsListCard>
              {showAdvancedMathControls ? (
                <>
                  <SettingsRow
                    title={language.t("settings.appearance.advancedMathTitle")}
                    description={language.t("settings.appearance.advancedMathDescription")}
                    control={
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-text-weak">
                              {advancedMathStatusLabel(advancedMathStatus, advancedMathLoading)}
                            </span>
                            {advancedMathStatus?.installedRuntimeVersion && (
                              <span className="text-[11px] text-text-subtle">
                                {formatRuntimeVersion(advancedMathStatus.installedRuntimeVersion)}
                              </span>
                            )}
                          </div>
                          <Switch
                            data-action="settings-advanced-math-toggle"
                            aria-label={language.t("settings.appearance.advancedMathToggleAria")}
                            checked={advancedMathEnabled}
                            disabled={advancedMathBusy || advancedMathStatus === null}
                            onCheckedChange={onToggleAdvancedMathRuntime}
                          />
                        </div>
                        {advancedMathStatus?.progressMessage ||
                        typeof advancedMathStatus?.progressPercent === "number" ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
                              <span className="truncate">
                                {advancedMathStatus?.progressMessage ??
                                  language.t("settings.appearance.working")}
                              </span>
                              {typeof advancedMathStatus?.progressPercent === "number" ? (
                                <span>{Math.round(advancedMathStatus.progressPercent)}%</span>
                              ) : null}
                            </div>
                            <Progress
                              value={advancedMathStatus?.progressPercent ?? 0}
                              className="h-1.5"
                            />
                          </div>
                        ) : null}
                        {advancedMathStatus?.lastError ? (
                          <p className="text-xs text-icon-critical-base">
                            {advancedMathStatus.lastError}
                          </p>
                        ) : null}
                      </div>
                    }
                  />
                  <Separator />
                </>
              ) : null}
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
            </SettingsListCard>
          </div>
        ) : null}
      </SettingsContent>
      <ConfirmRemoveMathRuntimeDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={onConfirmRemoveMathRuntime}
      />
    </>
  )
}
