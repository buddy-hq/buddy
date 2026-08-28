import { memo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, Switch } from "@buddy/ui"
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
import { useStandardsRuntime } from "./use-standards-runtime"
import { stringifyError } from "@/lib/api-client"
import type { SettingsTab } from "./settings-tabs"

const PACKAGES_TAB: SettingsTab = "packages"

function toolStateLabel(enabled: boolean) {
  return enabled ? language.t("settings.tools.enabled") : language.t("settings.tools.disabled")
}

const GlobalDefaultsBulkRow = memo(function GlobalDefaultsBulkRow(props: {
  allEnabled: boolean
  mixed: boolean
  disabled: boolean
  onToggleAll: (enabled: boolean) => void
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
}) {
  return (
    <SettingsRow
      title={STANDARDS_TOOL_DISPLAY_NAMES[props.toolId]}
      description={STANDARDS_TOOL_DESCRIPTIONS[props.toolId]}
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

/**
 * Shown to a teacher whose standards package is not installed yet. The tab is revealed by
 * `primaryUse === "teach"` so the feature is discoverable, but a wall of disabled switches
 * reads as broken — point at the switchboard instead.
 */
function StandardsNotInstalled(props: { onOpenPackages: () => void }) {
  return (
    <div className="space-y-2">
      <SettingsSectionHeader
        title={language.t("settings.standards.installPromptTitle")}
        description={language.t("settings.standards.installPromptDescription")}
      />
      <SettingsListCard>
        <SettingsRow
          title={language.t("settings.tools.standardsRuntimeTitle")}
          description={language.t("settings.tools.standardsRuntimeDescription")}
          control={
            <Button
              data-action="settings-standards-open-packages"
              type="button"
              onClick={props.onOpenPackages}
            >
              {language.t("settings.standards.installPromptAction")}
            </Button>
          }
        />
      </SettingsListCard>
    </div>
  )
}

export function StandardsSettings(props: { onOpenTab: (tab: SettingsTab) => void }) {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const { standardsStatus, standardsEnabled, standardsBusy } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })
  const defaults = buildGlobalStandardsDefaults(globalConfigQuery.data ?? {})
  const allGlobalEnabled = STANDARDS_TOOL_IDS.every((toolId) => defaults[toolId])
  const someGlobalEnabled = STANDARDS_TOOL_IDS.some((toolId) => defaults[toolId])
  // `!standardsEnabled` matters even though the install prompt below covers the known-absent case:
  // when the status query is disabled (web) or errored, `standardsStatus` stays null, the prompt
  // never renders, and these switches would otherwise write defaults for a runtime that is not there.
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

  // `standardsStatus === null` means the runtime has not reported yet; don't flash the prompt.
  if (!standardsEnabled && standardsStatus !== null) {
    return (
      <SettingsContent>
        <StandardsNotInstalled onOpenPackages={() => props.onOpenTab(PACKAGES_TAB)} />
      </SettingsContent>
    )
  }

  return (
    <SettingsContent>
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
          />
          {STANDARDS_TOOL_IDS.map((toolId) => (
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
    </SettingsContent>
  )
}
