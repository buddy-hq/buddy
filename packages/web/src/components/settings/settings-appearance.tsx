import { useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useTheme, type ColorScheme } from "@/theme"
import { SettingsListCard, SettingsRow, SettingsContent } from "./settings-primitives"
import { useAdvancedMathRuntime } from "./use-advanced-math-runtime"
import {
  AdvancedMathRuntimeControl,
  advancedMathRuntimeDescription,
} from "./advanced-math-runtime-control"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

export function AppearanceSettings() {
  const platform = usePlatform()

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

  const showAdvancedMathControls = platform.platform === "desktop"

  return (
    <>
      <SettingsContent>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.appearance.themeSection")}
          </h3>
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.appearance.colorSchemeTitle")}
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

        {showAdvancedMathControls ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.appearance.desktopSection")}
            </h3>
            <SettingsListCard>
              {showAdvancedMathControls ? (
                <>
                  <SettingsRow
                    title={language.t("settings.appearance.advancedMathTitle")}
                    description={advancedMathRuntimeDescription(platform.os)}
                    control={
                      <AdvancedMathRuntimeControl
                        os={platform.os}
                        status={advancedMathStatus}
                        loading={advancedMathLoading}
                        busy={advancedMathBusy}
                        enabled={advancedMathEnabled}
                        onToggle={onToggleAdvancedMathRuntime}
                        showStatusLabel
                      />
                    }
                  />
                </>
              ) : null}
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
