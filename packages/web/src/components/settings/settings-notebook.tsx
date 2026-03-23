import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@buddy/ui"
import { resolveDefaultPersonaID } from "@/state/chat-actions"
import type { LogLevel } from "@/state/project-settings"
import { useProjectSettings } from "@/state/project-settings"
import { SettingsListCard, SettingsRow } from "./settings-primitives"
import { SettingsPanelContent } from "./settings-page"

const DEFAULT_VALUE = "__default__"

export function NotebookSettings({ directory }: { directory: string }) {
  const settings = useProjectSettings(directory, true)

  const personaSelectValue =
    resolveDefaultPersonaID(settings.options.personas, settings.selection.persona || undefined) ||
    "buddy"
  const logLevelSelectValue = settings.selection.logLevel || DEFAULT_VALUE

  return (
    <SettingsPanelContent
      title="Notebook"
      description="Set defaults for this notebook's persona, teaching intent, and logging. Changes save automatically."
    >
      <SettingsListCard>
        <SettingsRow
          title="Default persona"
          description="Choose which Buddy persona is selected by default for new prompts in this notebook."
          control={
            <Select
              value={personaSelectValue}
              onValueChange={settings.actions.setPersona}
              disabled={settings.status.loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select persona" />
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
          title="Default intent"
          description="Choose the default teaching intent for new prompts in this notebook. Auto leaves intent unforced."
          control={
            <Select
              value={settings.selection.intent}
              onValueChange={(value) =>
                settings.actions.setIntent(value as "auto" | "learn" | "practice" | "assess")
              }
              disabled={settings.status.loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select default intent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="learn">Learn</SelectItem>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="assess">Assess</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title="Whole-book full-text reading"
          description="Allow Buddy to ingest an entire prepared resource into context when there is enough live context budget. Turn this off to avoid expensive full-book reads."
          control={
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {settings.selection.fullTextReadingEnabled ? "On" : "Off"}
              </span>
              <Switch
                checked={settings.selection.fullTextReadingEnabled}
                onCheckedChange={settings.actions.setFullTextReadingEnabled}
                disabled={settings.status.loading}
                aria-label="Enable whole-book full-text reading"
              />
            </div>
          }
        />
        <SettingsRow
          title="Log level"
          description="Controls backend logging verbosity for this notebook."
          last
          control={
            <Select
              value={logLevelSelectValue}
              onValueChange={(value) =>
                settings.actions.setLogLevel(value === DEFAULT_VALUE ? "" : (value as LogLevel))
              }
              disabled={settings.status.loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_VALUE}>Default</SelectItem>
                {import.meta.env.DEV && <SelectItem value="debug">debug</SelectItem>}
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsListCard>
    </SettingsPanelContent>
  )
}
