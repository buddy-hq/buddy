import { Switch } from "@buddy/ui"
import { language } from "@/context/language"
import { useToolsSettings, STANDARDS_TOOL_IDS, type StandardsToolId } from "@/state/tools-settings"
import { SettingsListCard, SettingsRow, SettingsContent } from "./settings-primitives"

const TOOL_DISPLAY_NAMES: Record<StandardsToolId, string> = {
  search_standards: "Search Standards",
  get_standard: "Get Standard",
  get_learning_components: "Get Learning Components",
  get_prerequisites: "Get Prerequisites",
  get_next_standards: "Get Next Standards",
  get_crosswalk: "Get Crosswalk",
  query_standards_sql: "Query Standards SQL",
}

const TOOL_DESCRIPTIONS: Record<StandardsToolId, string> = {
  search_standards: "Search for educational standards by query",
  get_standard: "Retrieve detailed information about a specific standard",
  get_learning_components: "Get learning components associated with a standard",
  get_prerequisites: "Retrieve prerequisite standards for a given standard",
  get_next_standards: "Get standards that follow a given standard",
  get_crosswalk: "Get crosswalk mappings between different standard jurisdictions",
  query_standards_sql: "Run a raw read-only SQLite query against the standards database",
}

export function ToolsSettings() {
  const { status, selection, actions } = useToolsSettings(true)

  return (
    <SettingsContent
      title={language.t("settings.tools.title")}
      description={language.t("settings.tools.description")}
    >
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-text-base">
          {language.t("settings.tools.standardsSection")}
        </h3>
        <SettingsListCard>
          {STANDARDS_TOOL_IDS.map((toolId, index) => (
            <SettingsRow
              key={toolId}
              title={TOOL_DISPLAY_NAMES[toolId]}
              description={TOOL_DESCRIPTIONS[toolId]}
              last={index === STANDARDS_TOOL_IDS.length - 1}
              control={
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-text-weak">
                    {selection[toolId]
                      ? language.t("settings.tools.enabled")
                      : language.t("settings.tools.disabled")}
                  </span>
                  <Switch
                    data-action={`settings-tool-${toolId}`}
                    aria-label={language.t("settings.tools.toggleAria", {
                      tool: TOOL_DISPLAY_NAMES[toolId],
                    })}
                    checked={selection[toolId]}
                    disabled={status.loading}
                    onCheckedChange={(checked) => actions.setToolEnabled(toolId, checked)}
                  />
                </div>
              }
            />
          ))}
        </SettingsListCard>
      </div>
    </SettingsContent>
  )
}
