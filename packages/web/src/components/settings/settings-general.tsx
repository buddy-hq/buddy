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
import { resolveDefaultPersonaID } from "@/state/chat-actions"
import { useProjectSettings } from "@/state/project-settings"
import { showDesktopUpdateToast } from "@/lib/desktop-updates"
import { useTheme, type ColorScheme } from "@/theme"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"

const GENERAL_INTENTS = ["auto", "learn", "practice", "assess"] as const

type GeneralIntent = (typeof GENERAL_INTENTS)[number]

function isColorScheme(value: string): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

function isGeneralIntent(value: string): value is GeneralIntent {
  return GENERAL_INTENTS.some((intent) => intent === value)
}

export function GeneralSettings({ directory }: { directory: string }) {
  const platform = usePlatform()
  const notebookSettings = useProjectSettings(directory, true)
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

  const personaSelectValue =
    resolveDefaultPersonaID(
      notebookSettings.options.personas,
      notebookSettings.selection.persona || undefined,
    ) || "buddy"
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
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-text-base">
          {language.t("settings.general.appearanceSection")}
        </h3>
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
            title={language.t("settings.appearance.themeTitle")}
            description={language.t("settings.appearance.themeDescription")}
            last
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

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-text-base">
          {language.t("settings.general.defaultsSection")}
        </h3>
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.notebook.defaultPersonaTitle")}
            description={language.t("settings.notebook.defaultPersonaDescription")}
            control={
              <Select
                value={personaSelectValue}
                onValueChange={notebookSettings.actions.setPersona}
                disabled={notebookSettings.status.loading}
              >
                <SelectTrigger data-action="settings-notebook-default-persona" className="w-full">
                  <SelectValue
                    placeholder={language.t("settings.notebook.defaultPersonaPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {notebookSettings.options.personas.map((persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            title={language.t("settings.notebook.defaultIntentTitle")}
            description={language.t("settings.notebook.defaultIntentDescription")}
            control={
              <Select
                value={notebookSettings.selection.intent}
                onValueChange={(value) => {
                  if (isGeneralIntent(value)) {
                    notebookSettings.actions.setIntent(value)
                  }
                }}
                disabled={notebookSettings.status.loading}
              >
                <SelectTrigger data-action="settings-notebook-default-intent" className="w-full">
                  <SelectValue
                    placeholder={language.t("settings.notebook.defaultIntentPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {language.t("settings.notebook.intents.auto")}
                  </SelectItem>
                  <SelectItem value="learn">
                    {language.t("settings.notebook.intents.learn")}
                  </SelectItem>
                  <SelectItem value="practice">
                    {language.t("settings.notebook.intents.practice")}
                  </SelectItem>
                  <SelectItem value="assess">
                    {language.t("settings.notebook.intents.assess")}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            title={language.t("settings.notebook.fullTextTitle")}
            description={language.t("settings.notebook.fullTextDescription")}
            last
            control={
              <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
                <span className="text-sm text-text-weak">
                  {notebookSettings.selection.fullTextReadingEnabled
                    ? language.t("settings.notebook.on")
                    : language.t("settings.notebook.off")}
                </span>
                <Switch
                  data-action="settings-notebook-full-text"
                  checked={notebookSettings.selection.fullTextReadingEnabled}
                  onCheckedChange={notebookSettings.actions.setFullTextReadingEnabled}
                  disabled={notebookSettings.status.loading}
                  aria-label={language.t("settings.notebook.fullTextAria")}
                />
              </div>
            }
          />
        </SettingsListCard>
      </div>

      {showDesktopUpdateControls ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.general.appSection")}
          </h3>
          <SettingsListCard>
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
  )
}
