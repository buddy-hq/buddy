import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@buddy/ui"
import { language } from "@/context/language"
import { resolveDefaultPersonaID } from "@/state/chat-actions"
import type { LogLevel } from "@/state/project-settings"
import { useProjectSettings } from "@/state/project-settings"
import { SettingsListCard, SettingsRow, SettingsContent } from "./settings-primitives"

const DEFAULT_VALUE = "__default__"

export function NotebookSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true)

  const personaSelectValue =
    resolveDefaultPersonaID(settings.options.personas, settings.selection.persona || undefined) ||
    "buddy"
  const logLevelSelectValue = settings.selection.logLevel || DEFAULT_VALUE

  return (
    <SettingsContent
      title={language.t("settings.notebook.title")}
      description={language.t("settings.notebook.description")}
    >
      <SettingsListCard>
        <SettingsRow
          title={language.t("settings.notebook.defaultPersonaTitle")}
          description={language.t("settings.notebook.defaultPersonaDescription")}
          control={
            <Select
              value={personaSelectValue}
              onValueChange={settings.actions.setPersona}
              disabled={settings.status.loading}
            >
              <SelectTrigger data-action="settings-notebook-default-persona" className="w-full">
                <SelectValue
                  placeholder={language.t("settings.notebook.defaultPersonaPlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {settings.options.personas.map((persona) => (
                  <SelectItem key={persona.id} value={persona.id}>
                    {persona.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={language.t("settings.notebook.fullTextTitle")}
          description={language.t("settings.notebook.fullTextDescription")}
          control={
            <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
              <span className="text-sm text-text-weak">
                {settings.selection.fullTextReadingEnabled
                  ? language.t("settings.notebook.on")
                  : language.t("settings.notebook.off")}
              </span>
              <Switch
                data-action="settings-notebook-full-text"
                checked={settings.selection.fullTextReadingEnabled}
                onCheckedChange={settings.actions.setFullTextReadingEnabled}
                disabled={settings.status.loading}
                aria-label={language.t("settings.notebook.fullTextAria")}
              />
            </div>
          }
        />
        <SettingsRow
          title={language.t("settings.notebook.logLevelTitle")}
          description={language.t("settings.notebook.logLevelDescription")}
          last
          control={
            <Select
              value={logLevelSelectValue}
              onValueChange={(value) =>
                settings.actions.setLogLevel(value === DEFAULT_VALUE ? "" : (value as LogLevel))
              }
              disabled={settings.status.loading}
            >
              <SelectTrigger data-action="settings-notebook-log-level" className="w-full">
                <SelectValue placeholder={language.t("settings.notebook.defaultLogLevel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_VALUE}>
                  {language.t("settings.notebook.defaultLogLevel")}
                </SelectItem>
                {import.meta.env.DEV && (
                  <SelectItem value="debug">
                    {language.t("settings.notebook.logLevels.debug")}
                  </SelectItem>
                )}
                <SelectItem value="info">
                  {language.t("settings.notebook.logLevels.info")}
                </SelectItem>
                <SelectItem value="warn">
                  {language.t("settings.notebook.logLevels.warn")}
                </SelectItem>
                <SelectItem value="error">
                  {language.t("settings.notebook.logLevels.error")}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsListCard>
    </SettingsContent>
  )
}
