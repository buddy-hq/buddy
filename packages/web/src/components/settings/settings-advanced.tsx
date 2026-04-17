import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Progress,
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
import { useProjectSettings } from "@/state/project-settings"
import {
  invalidateSkillsCatalogQuery,
  skillsCatalogQueryOptions,
} from "@/state/skills-catalog-query"
import { updateSkillsSettings, type SkillsCatalog } from "@/state/skills-actions"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"
import { SettingsContent, SettingsListCard, SettingsRow } from "./settings-primitives"
import {
  advancedMathStatusLabel,
  formatRuntimeVersion,
  useAdvancedMathRuntime,
} from "./use-advanced-math-runtime"
import { standardsStatusLabel, useStandardsRuntime } from "./use-standards-runtime"

const DEFAULT_LOG_LEVEL_VALUE = "__default__"
const ADVANCED_LOG_LEVELS = ["debug", "info", "warn", "error"] as const

type AdvancedLogLevel = (typeof ADVANCED_LOG_LEVELS)[number]

function isAdvancedLogLevel(value: string): value is AdvancedLogLevel {
  return ADVANCED_LOG_LEVELS.some((level) => level === value)
}

type AdvancedSettingsProps = {
  directory?: string
}

export function AdvancedSettings(props: AdvancedSettingsProps) {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const currentDirectory = props.directory ?? ""
  const notebookSettings = useProjectSettings(currentDirectory, currentDirectory.length > 0)
  const logLevelSelectValue = notebookSettings.selection.logLevel || DEFAULT_LOG_LEVEL_VALUE
  const showRuntimeControls = platform.platform === "desktop"
  const catalogQuery = useQuery(skillsCatalogQueryOptions(props.directory))
  const catalog = catalogQuery.data
  const loading = catalogQuery.isPending || catalogQuery.isFetching
  const {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen: mathRemoveConfirmOpen,
    setRemoveConfirmOpen: setMathRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  } = useAdvancedMathRuntime({
    open: true,
    platform: platform.platform,
  })
  const {
    standardsStatus,
    standardsBusy,
    standardsEnabled,
    removeConfirmOpen: standardsRemoveConfirmOpen,
    setRemoveConfirmOpen: setStandardsRemoveConfirmOpen,
    onToggleStandardsRuntime,
    onConfirmRemoveStandardsRuntime,
  } = useStandardsRuntime({
    open: true,
    platform: platform.platform,
  })

  useEffect(() => {
    if (!catalogQuery.error) return

    const message =
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : language.t("settings.advanced.loadSettingsFailed")
    toast.error(message)
  }, [catalogQuery.error])

  function setExternalVendorRootsEnabled(enabled: boolean) {
    queryClient.setQueryData<SkillsCatalog>(
      skillsCatalogQueryOptions(props.directory).queryKey,
      (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          externalVendorRootsEnabled: enabled,
        }
      },
    )
  }

  function toggleExternalVendorRoots(enabled: boolean) {
    if (!catalog) {
      return
    }
    if (catalog.externalVendorRootsEnabled === enabled) {
      return
    }

    void (async () => {
      const key = "settings:external-roots"
      const previous = catalog.externalVendorRootsEnabled
      setBusyKey(key)
      setExternalVendorRootsEnabled(enabled)

      try {
        await updateSkillsSettings(enabled, props.directory)
        await invalidateSkillsCatalogQuery(queryClient, props.directory)
        await catalogQuery.refetch()
        toast.success(
          enabled
            ? language.t("settings.advanced.externalRootsEnabled")
            : language.t("settings.advanced.externalRootsDisabled"),
        )
      } catch (error) {
        setExternalVendorRootsEnabled(previous)
        const message =
          error instanceof Error ? error.message : language.t("settings.advanced.requestFailed")
        toast.error(message)
      } finally {
        setBusyKey(undefined)
      }
    })()
  }

  return (
    <>
      <SettingsContent
        title={language.t("settings.advanced.title")}
        description={language.t("settings.advanced.description")}
      >
        {showRuntimeControls ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.advanced.runtimeSection")}
            </h3>
            <SettingsListCard>
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
                        {advancedMathStatus?.installedRuntimeVersion ? (
                          <span className="text-[11px] text-text-subtle">
                            {formatRuntimeVersion(advancedMathStatus.installedRuntimeVersion)}
                          </span>
                        ) : null}
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
          </div>
        ) : null}

        {props.directory ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-base">
              {language.t("settings.advanced.notebookSection")}
            </h3>
            <SettingsListCard>
              <SettingsRow
                title={language.t("settings.notebook.logLevelTitle")}
                description={language.t("settings.notebook.logLevelDescription")}
                last
                control={
                  <Select
                    value={logLevelSelectValue}
                    onValueChange={(value) => {
                      if (value === DEFAULT_LOG_LEVEL_VALUE) {
                        notebookSettings.actions.setLogLevel("")
                        return
                      }

                      if (isAdvancedLogLevel(value)) {
                        notebookSettings.actions.setLogLevel(value)
                      }
                    }}
                    disabled={notebookSettings.status.loading}
                  >
                    <SelectTrigger data-action="settings-notebook-log-level" className="w-full">
                      <SelectValue placeholder={language.t("settings.notebook.defaultLogLevel")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_LOG_LEVEL_VALUE}>
                        {language.t("settings.notebook.defaultLogLevel")}
                      </SelectItem>
                      {import.meta.env.DEV ? (
                        <SelectItem value="debug">
                          {language.t("settings.notebook.logLevels.debug")}
                        </SelectItem>
                      ) : null}
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
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-base">
            {language.t("settings.advanced.skillDiscoverySection")}
          </h3>
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.advanced.discoverExternalSkills")}
              description={language.t("settings.advanced.externalSkillsDescription")}
              last
              control={
                <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
                  <span className="text-sm text-text-weak">
                    {catalog?.externalVendorRootsEnabled
                      ? language.t("settings.advanced.on")
                      : language.t("settings.advanced.off")}
                  </span>
                  <Switch
                    checked={catalog?.externalVendorRootsEnabled ?? false}
                    onCheckedChange={toggleExternalVendorRoots}
                    disabled={loading || busyKey === "settings:external-roots"}
                    aria-label={language.t("settings.advanced.discoverExternalRootsAria")}
                  />
                </div>
              }
            />
          </SettingsListCard>
        </div>
      </SettingsContent>

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
  )
}
