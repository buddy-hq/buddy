import { memo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Progress, Switch } from "@buddy/ui"
import { language } from "@/context/language"
import { patchGlobalConfig } from "@/state/chat-actions"
import { globalConfigQueryOptions, setGlobalConfigQueryData } from "@/state/global-config-query"
import {
  STANDARDS_TOOL_IDS,
  STANDARDS_TOOL_DESCRIPTIONS,
  STANDARDS_TOOL_DISPLAY_NAMES,
  buildGlobalStandardsDefaults,
  buildGlobalStandardsPatch,
  type StandardsToolId,
} from "@/state/standards-settings"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSectionHeader,
} from "./settings-primitives"
import { usePlatform } from "@/context/platform"
import { standardsStatusLabel, useStandardsRuntime } from "./use-standards-runtime"
import { stringifyError } from "@/lib/api-client"
import { parseTNumber } from "@/components/chat/tools/types"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"

function toolStateLabel(enabled: boolean) {
  return enabled ? language.t("settings.tools.enabled") : language.t("settings.tools.disabled")
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
      title={STANDARDS_TOOL_DISPLAY_NAMES[props.toolId]}
      description={STANDARDS_TOOL_DESCRIPTIONS[props.toolId]}
      last={props.last}
      control={
        <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
          <span className="text-sm text-text-weak">{toolStateLabel(props.enabled)}</span>
          <Switch
            data-action={`settings-tool-default-${props.toolId}`}
            aria-label={language.t("settings.tools.toggleGlobalAria", {
              tool: STANDARDS_TOOL_DISPLAY_NAMES[props.toolId],
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

export function StandardsSettings() {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const {
    standardsStatus,
    standardsLoading,
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
  const defaults = buildGlobalStandardsDefaults(globalConfigQuery.data ?? {})
  const allGlobalEnabled = STANDARDS_TOOL_IDS.every((toolId) => defaults[toolId])
  const someGlobalEnabled = STANDARDS_TOOL_IDS.some((toolId) => defaults[toolId])
  const toolControlsDisabled =
    globalConfigQuery.isPending || saving || standardsBusy || !standardsEnabled

  async function applyDefaults(nextDefaults: typeof defaults) {
    const patch = buildGlobalStandardsPatch(globalConfigQuery.data ?? {}, nextDefaults)
    if (!patch) {
      return
    }

    setSaving(true)
    setError(undefined)

    try {
      const updatedGlobal = await patchGlobalConfig(patch)
      setGlobalConfigQueryData(queryClient, updatedGlobal)
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsContent>
      <div className="space-y-2">
        <SettingsSectionHeader
          title={language.t("settings.tools.standardsRuntimeSection")}
          description={language.t("settings.tools.standardsRuntimeDescription")}
        />
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.tools.standardsRuntimeTitle")}
            description={standardsStatusLabel(standardsStatus, standardsLoading)}
            control={
              <Switch
                data-action="settings-standards-runtime-toggle"
                aria-label={language.t("settings.tools.standardsRuntimeToggleAria")}
                checked={standardsEnabled}
                disabled={standardsBusy || standardsStatus === null}
                onCheckedChange={onToggleStandardsRuntime}
              />
            }
          />
          {standardsStatus?.progressMessage ||
          parseTNumber(standardsStatus?.progressPercent) !== undefined ? (
            <div className="space-y-1 border-t border-border-base/60 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
                <span>{standardsStatus.progressMessage}</span>
                {parseTNumber(standardsStatus.progressPercent) !== undefined ? (
                  <span>{Math.round(standardsStatus.progressPercent)}%</span>
                ) : null}
              </div>
              <Progress value={standardsStatus.progressPercent ?? 0} className="h-1.5" />
            </div>
          ) : null}
        </SettingsListCard>
      </div>

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
            onToggleAll={(enabled) => {
              const nextDefaults = { ...defaults }
              for (const toolId of STANDARDS_TOOL_IDS) {
                nextDefaults[toolId] = enabled
              }
              void applyDefaults(nextDefaults)
            }}
            last={false}
          />
          {STANDARDS_TOOL_IDS.map((toolId, index) => (
            <GlobalToolRow
              key={toolId}
              toolId={toolId}
              enabled={defaults[toolId]}
              disabled={toolControlsDisabled}
              onToggleTool={(nextToolId, enabled) => {
                void applyDefaults({
                  ...defaults,
                  [nextToolId]: enabled,
                })
              }}
              last={index === STANDARDS_TOOL_IDS.length - 1}
            />
          ))}
        </SettingsListCard>
      </div>

      {globalConfigQuery.error ? (
        <p className="text-xs text-icon-critical-base">{stringifyError(globalConfigQuery.error)}</p>
      ) : null}
      {error ? <p className="text-xs text-icon-critical-base">{error}</p> : null}
      {standardsStatus?.lastError ? (
        <p className="text-xs text-icon-critical-base">{standardsStatus.lastError}</p>
      ) : null}
      <ConfirmRemoveStandardsRuntimeDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={onConfirmRemoveStandardsRuntime}
      />
    </SettingsContent>
  )
}
