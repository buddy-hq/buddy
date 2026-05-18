import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@buddy/ui"
import { pickProjectDirectory } from "@/lib/directory-picker"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  invalidateSkillsCatalogQuery,
  skillsCatalogQueryOptions,
} from "@/state/skills-catalog-query"
import { updateSkillsSettings, type SkillsCatalog } from "@/state/skills-actions"
import { loadGlobalConfig, patchGlobalConfig, saveNotebookHome } from "@/state/chat-actions"
import { notebookHomeQueryOptions, setNotebookHomeQueryData } from "@/state/bootstrap-query"
import { useGeneralSettings } from "@/state/general-settings"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from "./settings-primitives"
import type { SettingsWorkbench } from "./settings-workbench"
import {
  formatRuntimeVersion,
  useAdvancedMathRuntime,
} from "./use-advanced-math-runtime"
import { useStandardsRuntime } from "./use-standards-runtime"

const DEFAULT_LOG_LEVEL_VALUE = "__default__"
const ADVANCED_LOG_LEVELS = ["debug", "info", "warn", "error"] as const

type AdvancedLogLevel = (typeof ADVANCED_LOG_LEVELS)[number]

function isAdvancedLogLevel(value: string): value is AdvancedLogLevel {
  return ADVANCED_LOG_LEVELS.some((level) => level === value)
}

export function AdvancedSettings({ workbench }: { workbench: SettingsWorkbench }) {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const [logLevelDraft, setLogLevelDraft] = useState<string>(DEFAULT_LOG_LEVEL_VALUE)
  const [logLevelBusy, setLogLevelBusy] = useState(false)
  const [changingBuddyHome, setChangingBuddyHome] = useState(false)
  const generalSettings = useGeneralSettings({
    cleanupDirectories: workbench.openDirectories,
  })
  const notebookHomeQuery = useQuery(notebookHomeQueryOptions())
  const notebookHome = notebookHomeQuery.data
  const globalConfigQuery = useQuery({
    queryKey: ["settings", "global-config"],
    queryFn: loadGlobalConfig,
  })
  const logLevelLoading = globalConfigQuery.isPending || globalConfigQuery.isFetching
  const logLevelSelectValue = logLevelDraft
  const showRuntimeControls = platform.platform === "desktop"
  const catalogQuery = useQuery(skillsCatalogQueryOptions(workbench.selectedDirectory))
  const catalog = catalogQuery.data
  const loading = catalogQuery.isPending || catalogQuery.isFetching
  const {
    advancedMathStatus,
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

  useEffect(() => {
    if (!globalConfigQuery.error) return

    const message =
      globalConfigQuery.error instanceof Error
        ? globalConfigQuery.error.message
        : language.t("settings.advanced.loadSettingsFailed")
    toast.error(message)
  }, [globalConfigQuery.error])

  useEffect(() => {
    if (!globalConfigQuery.data) return
    const level = globalConfigQuery.data.logLevel
    if (typeof level === "string" && isAdvancedLogLevel(level)) {
      setLogLevelDraft(level)
    } else {
      setLogLevelDraft(DEFAULT_LOG_LEVEL_VALUE)
    }
  }, [globalConfigQuery.data])

  function setExternalVendorRootsEnabled(enabled: boolean) {
    queryClient.setQueryData<SkillsCatalog>(
      skillsCatalogQueryOptions(workbench.selectedDirectory).queryKey,
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

  async function handleLogLevelChange(value: string) {
    const previous = logLevelDraft
    setLogLevelDraft(value)
    setLogLevelBusy(true)
    try {
      await patchGlobalConfig({ logLevel: value || null })
    } catch (error) {
      setLogLevelDraft(previous)
      const message =
        error instanceof Error ? error.message : language.t("settings.advanced.requestFailed")
      toast.error(message)
    } finally {
      setLogLevelBusy(false)
    }
  }

  async function onChangeBuddyHome() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      setChangingBuddyHome(true)
      const nextNotebookHome = await saveNotebookHome(picked)
      setNotebookHomeQueryData(queryClient, nextNotebookHome)
      toast.success(language.t("settings.general.buddyHomeSaved"))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : language.t("settings.general.buddyHomeSaveFailed"),
      )
    } finally {
      setChangingBuddyHome(false)
    }
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
        await updateSkillsSettings(enabled)
        await invalidateSkillsCatalogQuery(queryClient, workbench.selectedDirectory)
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
      <SettingsContent>
        {showRuntimeControls ? (
          <div className="space-y-2">
            <SettingsSectionHeader title="Packages" />
            <SettingsListCard>
              <SettingsRow
                title={language.t("settings.appearance.advancedMathTitle")}
                description={language.t("settings.appearance.advancedMathDescription")}
                control={
                  <div className="space-y-2">
                    <div className="flex items-center justify-end">
                      <Switch
                        data-action="settings-advanced-math-toggle"
                        aria-label={language.t("settings.appearance.advancedMathToggleAria")}
                        checked={advancedMathEnabled}
                        disabled={advancedMathBusy || advancedMathStatus === null}
                        onCheckedChange={onToggleAdvancedMathRuntime}
                      />
                    </div>
                    {advancedMathStatus?.installedRuntimeVersion ? (
                      <span className="text-[11px] text-text-subtle">
                        {formatRuntimeVersion(advancedMathStatus.installedRuntimeVersion)}
                      </span>
                    ) : null}
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
                    <div className="flex items-center justify-end">
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

        <div className="space-y-2">
          <SettingsSectionHeader
            title="Diagnostics"
            description="Controls backend logging verbosity for Buddy."
          />
          <SettingsListCard>
            <SettingsRow
              title={language.t("settings.advanced.logLevelTitle")}
              description={language.t("settings.advanced.logLevelDescription")}
              last
              control={
                <Select
                  value={logLevelSelectValue}
                  onValueChange={(value) => {
                    if (value === DEFAULT_LOG_LEVEL_VALUE) {
                      void handleLogLevelChange("")
                      return
                    }

                    if (isAdvancedLogLevel(value)) {
                      void handleLogLevelChange(value)
                    }
                  }}
                  disabled={logLevelLoading || logLevelBusy}
                >
                  <SelectTrigger data-action="settings-log-level" className="w-full">
                    <SelectValue placeholder={language.t("settings.advanced.defaultLogLevel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_LOG_LEVEL_VALUE}>
                      {language.t("settings.advanced.defaultLogLevel")}
                    </SelectItem>
                    {import.meta.env.DEV ? (
                      <SelectItem value="debug">
                        {language.t("settings.advanced.logLevels.debug")}
                      </SelectItem>
                    ) : null}
                    <SelectItem value="info">
                      {language.t("settings.advanced.logLevels.info")}
                    </SelectItem>
                    <SelectItem value="warn">
                      {language.t("settings.advanced.logLevels.warn")}
                    </SelectItem>
                    <SelectItem value="error">
                      {language.t("settings.advanced.logLevels.error")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          </SettingsListCard>
        </div>

        <SettingsSection title="Behavior">
          <SettingsRow
            title={language.t("settings.general.fullTextTitle")}
            description="Allow Buddy to read an entire prepared resource into context when there is enough live context budget. Turn this off to avoid expensive full-book reads."
            control={
              <Switch
                data-action="settings-global-full-text"
                checked={generalSettings.selection.fullTextReadingEnabled}
                onCheckedChange={generalSettings.actions.setFullTextReadingEnabled}
                disabled={generalSettings.status.loading}
                aria-label={language.t("settings.general.fullTextAria")}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.general.autoCompactionTitle")}
            description="Automatically compact the session when context reaches the model limit window. Turn this off to keep full history and compact manually with slash commands."
            control={
              <Switch
                data-action="settings-global-auto-compaction"
                checked={generalSettings.selection.autoCompactionEnabled}
                onCheckedChange={generalSettings.actions.setAutoCompactionEnabled}
                disabled={generalSettings.status.loading}
                aria-label={language.t("settings.general.autoCompactionAria")}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.general.buddyHomeTitle")}
            description={
              notebookHome?.resolvedDirectory
                ? `${language.t("settings.general.buddyHomeDescription")} (${notebookHome.resolvedDirectory})`
                : language.t("settings.general.buddyHomeDescription")
            }
            last
            control={
              <Button
                data-action="settings-change-buddy-home"
                type="button"
                onClick={() => void onChangeBuddyHome()}
                disabled={changingBuddyHome || notebookHomeQuery.isPending}
              >
                {changingBuddyHome
                  ? language.t("settings.general.buddyHomeChanging")
                  : language.t("settings.general.buddyHomeChange")}
              </Button>
            }
          />
        </SettingsSection>

        <div className="space-y-2">
          <SettingsSectionHeader
            title="Skill discovery"
            description="Skill discovery behavior applies to Buddy's skill catalog on this machine."
          />
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
