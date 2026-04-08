import { memo, useEffect, useMemo, useState } from "react"
import {
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useChatStore } from "@/state/chat-store"
import {
  STANDARDS_TOOL_IDS,
  TOOL_OVERRIDE_MODE,
  type StandardsToolOverrideMode,
  type StandardsToolId,
  useToolsSettings,
} from "@/state/tools-settings"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"
import { standardsStatusLabel, useStandardsRuntime } from "./use-standards-runtime"

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

function toolStateLabel(enabled: boolean) {
  return enabled ? language.t("settings.tools.enabled") : language.t("settings.tools.disabled")
}

function isToolOverrideMode(value: string): value is StandardsToolOverrideMode {
  return (
    value === TOOL_OVERRIDE_MODE.inherit ||
    value === TOOL_OVERRIDE_MODE.enabled ||
    value === TOOL_OVERRIDE_MODE.disabled
  )
}

function notebookDisplayName(directory: string) {
  const parts = directory.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? directory
}

function resolveNotebookOptions(currentDirectory: string, openProjects: string[]) {
  return Array.from(new Set([currentDirectory, ...openProjects]))
}

const GlobalDefaultsBulkRow = memo(function GlobalDefaultsBulkRow(props: {
  allEnabled: boolean
  mixed: boolean
  disabled: boolean
  onToggleAll: (enabled: boolean) => void
  last?: boolean
}) {
  const stateLabel = props.allEnabled
    ? language.t("settings.tools.enabled")
    : props.mixed
      ? language.t("settings.tools.mixed")
      : language.t("settings.tools.disabled")

  return (
    <SettingsRow
      title={language.t("settings.tools.globalDefaultsBulkTitle")}
      description={language.t("settings.tools.globalDefaultsBulkDescription")}
      last={props.last}
      control={
        <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
          <span className="text-sm text-text-weak">{stateLabel}</span>
          <Switch
            data-action="settings-tool-default-all"
            aria-label={language.t("settings.tools.toggleGlobalAllAria")}
            checked={props.allEnabled}
            disabled={props.disabled}
            onCheckedChange={props.onToggleAll}
          />
        </div>
      }
    />
  )
})

const GlobalToolRow = memo(function GlobalToolRow(props: {
  toolId: StandardsToolId
  enabled: boolean
  disabled: boolean
  onToggleTool: (toolId: StandardsToolId, enabled: boolean) => void
  last?: boolean
}) {
  return (
    <SettingsRow
      title={TOOL_DISPLAY_NAMES[props.toolId]}
      description={TOOL_DESCRIPTIONS[props.toolId]}
      last={props.last}
      control={
        <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
          <span className="text-sm text-text-weak">{toolStateLabel(props.enabled)}</span>
          <Switch
            data-action={`settings-tool-default-${props.toolId}`}
            aria-label={language.t("settings.tools.toggleGlobalAria", {
              tool: TOOL_DISPLAY_NAMES[props.toolId],
            })}
            checked={props.enabled}
            disabled={props.disabled}
            onCheckedChange={(checked) => props.onToggleTool(props.toolId, checked)}
          />
        </div>
      }
    />
  )
})

const NotebookToolRow = memo(function NotebookToolRow(props: {
  toolId: StandardsToolId
  mode: StandardsToolOverrideMode
  disabled: boolean
  onModeChange: (toolId: StandardsToolId, mode: StandardsToolOverrideMode) => void
  last?: boolean
}) {
  return (
    <SettingsRow
      title={TOOL_DISPLAY_NAMES[props.toolId]}
      description={TOOL_DESCRIPTIONS[props.toolId]}
      last={props.last}
      control={
        <Select
          value={props.mode}
          onValueChange={(value) => {
            if (!isToolOverrideMode(value)) {
              return
            }
            props.onModeChange(props.toolId, value)
          }}
          disabled={props.disabled}
        >
          <SelectTrigger
            data-action={`settings-tool-override-${props.toolId}`}
            className="w-full"
            aria-label={language.t("settings.tools.overrideNotebookAria", {
              tool: TOOL_DISPLAY_NAMES[props.toolId],
            })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOOL_OVERRIDE_MODE.inherit}>
              {language.t("settings.tools.useGlobalDefault")}
            </SelectItem>
            <SelectItem value={TOOL_OVERRIDE_MODE.enabled}>
              {language.t("settings.tools.enabledForNotebook")}
            </SelectItem>
            <SelectItem value={TOOL_OVERRIDE_MODE.disabled}>
              {language.t("settings.tools.disabledForNotebook")}
            </SelectItem>
          </SelectContent>
        </Select>
      }
    />
  )
})

function ToolsSettingsPanel(props: {
  selectedNotebookDirectory: string
  notebookOptions: string[]
  onSelectedNotebookDirectoryChange: (directory: string) => void
}) {
  const platform = usePlatform()
  const { status, selection, actions } = useToolsSettings(props.selectedNotebookDirectory, true)
  const {
    standardsStatus,
    standardsBusy,
    standardsEnabled,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onToggleStandardsRuntime,
    onConfirmRemoveStandardsRuntime,
  } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })

  const showStandardsRuntimeControls = platform.platform === "desktop"
  const toolControlsDisabled = status.loading || status.saving
  const allGlobalEnabled = STANDARDS_TOOL_IDS.every((toolId) => selection.globalDefaults[toolId])
  const someGlobalEnabled = STANDARDS_TOOL_IDS.some((toolId) => selection.globalDefaults[toolId])

  return (
    <>
      <SettingsContent
        title={language.t("settings.tools.title")}
        description={language.t("settings.tools.description")}
      >
        {showStandardsRuntimeControls ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.tools.standardsRuntimeSection")}
            </h3>
            <SettingsListCard>
              <SettingsRow
                title={language.t("settings.tools.standardsRuntimeTitle")}
                description={language.t("settings.tools.standardsRuntimeDescription")}
                last
                control={
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-weak">
                          {standardsStatusLabel(standardsStatus, standardsBusy)}
                        </span>
                        {standardsStatus?.installedDatasetVersion ? (
                          <span className="text-[11px] text-text-subtle">
                            {standardsStatus.installedDatasetVersion}
                          </span>
                        ) : null}
                      </div>
                      <Switch
                        data-action="settings-standards-runtime-toggle"
                        aria-label={language.t("settings.tools.standardsRuntimeToggleAria")}
                        checked={standardsEnabled}
                        disabled={standardsBusy || standardsStatus === null}
                        onCheckedChange={onToggleStandardsRuntime}
                      />
                    </div>
                    {standardsStatus?.progressMessage ||
                    typeof standardsStatus?.progressPercent === "number" ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
                          <span className="truncate">
                            {standardsStatus?.progressMessage ??
                              language.t("settings.appearance.working")}
                          </span>
                          {typeof standardsStatus?.progressPercent === "number" ? (
                            <span>{Math.round(standardsStatus.progressPercent)}%</span>
                          ) : null}
                        </div>
                        <Progress value={standardsStatus?.progressPercent ?? 0} className="h-1.5" />
                      </div>
                    ) : null}
                    {standardsStatus?.lastError ? (
                      <p className="text-xs text-icon-critical-base">{standardsStatus.lastError}</p>
                    ) : null}
                  </div>
                }
              />
            </SettingsListCard>
            {!standardsEnabled ? (
              <p className="text-xs text-text-weak">
                {language.t("settings.tools.installStandardsToEnable")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.tools.globalDefaultsSection")}
            </h3>
            <p className="text-xs text-text-weak">
              {language.t("settings.tools.globalDefaultsDescription")}
            </p>
          </div>
          <SettingsListCard>
            <GlobalDefaultsBulkRow
              allEnabled={allGlobalEnabled}
              mixed={!allGlobalEnabled && someGlobalEnabled}
              disabled={toolControlsDisabled}
              onToggleAll={actions.setAllGlobalToolsEnabled}
              last={false}
            />
            {STANDARDS_TOOL_IDS.map((toolId, index) => (
              <GlobalToolRow
                key={`global-${toolId}`}
                toolId={toolId}
                enabled={selection.globalDefaults[toolId]}
                disabled={toolControlsDisabled}
                onToggleTool={actions.setGlobalToolEnabled}
                last={index === STANDARDS_TOOL_IDS.length - 1}
              />
            ))}
          </SettingsListCard>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.tools.notebookOverridesSection")}
            </h3>
            <p className="text-xs text-text-weak">
              {language.t("settings.tools.notebookOverridesDescription")}
            </p>
          </div>
          <div className="rounded-md border border-border-base/60 bg-surface-weak/30 p-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-base">
                {language.t("settings.tools.notebookSelectorLabel")}
              </p>
              <Select
                value={props.selectedNotebookDirectory}
                onValueChange={(value) => {
                  if (!props.notebookOptions.includes(value)) {
                    return
                  }
                  if (value === props.selectedNotebookDirectory) {
                    return
                  }
                  void (async () => {
                    const saved = await actions.save()
                    if (!saved) {
                      return
                    }
                    props.onSelectedNotebookDirectoryChange(value)
                  })()
                }}
                disabled={toolControlsDisabled}
              >
                <SelectTrigger
                  data-action="settings-tool-notebook-select"
                  className="w-full"
                  aria-label={language.t("settings.tools.notebookSelectorAria")}
                >
                  <SelectValue placeholder={notebookDisplayName(props.selectedNotebookDirectory)} />
                </SelectTrigger>
                <SelectContent>
                  {props.notebookOptions.map((directory) => (
                    <SelectItem key={directory} value={directory}>
                      {notebookDisplayName(directory)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-text-weak">{props.selectedNotebookDirectory}</p>
            </div>
          </div>
          <SettingsListCard>
            {STANDARDS_TOOL_IDS.map((toolId, index) => (
              <NotebookToolRow
                key={`notebook-${toolId}`}
                toolId={toolId}
                mode={selection.notebookOverrides[toolId]}
                disabled={toolControlsDisabled}
                onModeChange={actions.setProjectToolMode}
                last={index === STANDARDS_TOOL_IDS.length - 1}
              />
            ))}
          </SettingsListCard>
        </div>

        {status.error ? <p className="text-xs text-icon-critical-base">{status.error}</p> : null}
      </SettingsContent>
      <ConfirmRemoveStandardsRuntimeDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={onConfirmRemoveStandardsRuntime}
      />
    </>
  )
}

export function ToolsSettings(props: { directory: string }) {
  const openProjects = useChatStore((state) => state.openProjects)
  const notebookOptions = useMemo(
    () => resolveNotebookOptions(props.directory, openProjects),
    [openProjects, props.directory],
  )
  const [selectedNotebookDirectory, setSelectedNotebookDirectory] = useState(props.directory)

  useEffect(() => {
    setSelectedNotebookDirectory(props.directory)
  }, [props.directory])

  useEffect(() => {
    if (notebookOptions.includes(selectedNotebookDirectory)) {
      return
    }
    setSelectedNotebookDirectory(props.directory)
  }, [notebookOptions, props.directory, selectedNotebookDirectory])

  return (
    <ToolsSettingsPanel
      selectedNotebookDirectory={selectedNotebookDirectory}
      notebookOptions={notebookOptions}
      onSelectedNotebookDirectoryChange={setSelectedNotebookDirectory}
    />
  )
}
