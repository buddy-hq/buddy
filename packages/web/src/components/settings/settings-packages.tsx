import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Progress, Switch, toast } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { parseTNumber } from "@/components/chat/tools/types"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
  updateExperimentalFeature,
} from "@/state/experimental-features-query"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSectionHeader,
} from "./settings-primitives"
import {
  AdvancedMathRuntimeControl,
  advancedMathRuntimeDescription,
} from "./advanced-math-runtime-control"
import { useAdvancedMathRuntime } from "./use-advanced-math-runtime"
import { useStandardsRuntime } from "./use-standards-runtime"
import { packageActivityLabel } from "./package-activity"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"

const MEMORY_BUSY_KEY = "packages:memory"

/**
 * The add-on switchboard: every optional capability is turned on from here, and each one that
 * carries its own settings reveals a tab of its own once it is active. Keeping the switches in
 * one place is what makes that reveal legible — you enable a thing here, its tab appears.
 */
export function PackagesSettings() {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const runtimesSupported = platform.platform === "desktop"

  const {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen: mathRemoveConfirmOpen,
    setRemoveConfirmOpen: setMathRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  } = useAdvancedMathRuntime({ open: true, platform: platform.platform })

  const {
    standardsStatus,
    standardsLoading,
    standardsBusy,
    standardsEnabled,
    removeConfirmOpen: standardsRemoveConfirmOpen,
    setRemoveConfirmOpen: setStandardsRemoveConfirmOpen,
    onToggleStandardsRuntime,
    onConfirmRemoveStandardsRuntime,
  } = useStandardsRuntime({ open: true, platform: platform.platform })
  const standardsProgressPercent = parseTNumber(standardsStatus?.progressPercent)
  const standardsActivity = packageActivityLabel({
    state: standardsStatus?.state,
    loading: standardsLoading,
  })

  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const memoryEnabled = experimentalFeatureIsEnabled(
    experimentalFeaturesQuery.data,
    EXPERIMENTAL_FEATURE_ID.learnerMemory,
  )

  function toggleMemory(enabled: boolean) {
    if (memoryEnabled === enabled) {
      return
    }

    void (async () => {
      setBusyKey(MEMORY_BUSY_KEY)
      try {
        await updateExperimentalFeature({
          queryClient,
          featureID: EXPERIMENTAL_FEATURE_ID.learnerMemory,
          enabled,
        })
        toast.success(
          language.t(
            enabled
              ? "settings.advanced.learnerMemoryExperimentEnabled"
              : "settings.advanced.learnerMemoryExperimentDisabled",
          ),
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : language.t("settings.advanced.requestFailed"),
        )
      } finally {
        setBusyKey(undefined)
      }
    })()
  }

  return (
    <>
      <SettingsContent>
        {/* Runtimes are a desktop capability; on web the whole section would be an empty card. */}
        {runtimesSupported ? (
          <div className="space-y-2">
            <SettingsSectionHeader
              title={language.t("settings.packages.title")}
              description={language.t("settings.packages.description")}
            />
            <SettingsListCard>
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
                  />
                }
              />
              <SettingsRow
                title={language.t("settings.tools.standardsRuntimeTitle")}
                description={language.t("settings.tools.standardsRuntimeDescription")}
                control={
                  <div className="space-y-2">
                    <div className="flex items-center justify-end gap-3">
                      {standardsActivity ? (
                        <span className="text-xs text-text-weak">{standardsActivity}</span>
                      ) : null}
                      <Switch
                        data-action="settings-standards-runtime-toggle"
                        aria-label={language.t("settings.tools.standardsRuntimeToggleAria")}
                        checked={standardsEnabled}
                        disabled={standardsBusy || standardsStatus === null}
                        onCheckedChange={onToggleStandardsRuntime}
                      />
                    </div>
                    {standardsStatus?.installedDatasetVersion ? (
                      <span className="text-[11px] text-text-subtle">
                        {standardsStatus.installedDatasetVersion}
                      </span>
                    ) : null}
                    {standardsStatus?.progressMessage || standardsProgressPercent !== undefined ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
                          <span className="truncate">
                            {standardsStatus?.progressMessage ??
                              language.t("settings.appearance.working")}
                          </span>
                          {standardsProgressPercent !== undefined ? (
                            <span>{Math.round(standardsProgressPercent)}%</span>
                          ) : null}
                        </div>
                        <Progress value={standardsProgressPercent ?? 0} className="h-1.5" />
                      </div>
                    ) : null}
                    {standardsStatus?.lastError ? (
                      <p className="text-xs text-icon-critical-base">{standardsStatus.lastError}</p>
                    ) : null}
                  </div>
                }
              />
            </SettingsListCard>
          </div>
        ) : null}

        {/*
          Experimental capabilities keep their own header: the "may change or be removed"
          caveat is the disclosure a user needs before switching one on, and a badge alone
          does not say it.
        */}
        <div className="space-y-2">
          <SettingsSectionHeader
            title={language.t("settings.advanced.experimentalFeaturesTitle")}
            description={language.t("settings.advanced.experimentalFeaturesDescription")}
          />
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.advanced.learnerMemoryExperimentTitle")}
              description={language.t("settings.advanced.learnerMemoryExperimentDescription")}
              control={
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="h-5 text-text-weak">
                    {language.t("settings.advanced.experimentalBadge")}
                  </Badge>
                  <Switch
                    data-action={`settings-experiment-${EXPERIMENTAL_FEATURE_ID.learnerMemory}`}
                    aria-label={language.t("settings.advanced.learnerMemoryExperimentAria")}
                    checked={memoryEnabled}
                    disabled={
                      experimentalFeaturesQuery.isPending ||
                      experimentalFeaturesQuery.isError ||
                      busyKey === MEMORY_BUSY_KEY
                    }
                    onCheckedChange={toggleMemory}
                  />
                </div>
              }
            />
          </SettingsListCard>
        </div>
      </SettingsContent>

      {runtimesSupported ? (
        <>
          <ConfirmRemoveMathRuntimeDialog
            open={mathRemoveConfirmOpen}
            onOpenChange={setMathRemoveConfirmOpen}
            onConfirm={onConfirmRemoveMathRuntime}
          />
          <ConfirmRemoveStandardsRuntimeDialog
            open={standardsRemoveConfirmOpen}
            onOpenChange={setStandardsRemoveConfirmOpen}
            onConfirm={onConfirmRemoveStandardsRuntime}
          />
        </>
      ) : null}
    </>
  )
}
