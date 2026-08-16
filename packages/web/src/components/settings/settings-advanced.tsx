import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Badge,
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
import { useChatStore } from "@/state/chat-store"
import { invalidateAllSkillsCatalogQueries } from "@/state/skills-catalog-query"
import { updateSkillsSettings } from "@/state/skills-actions"
import { patchGlobalConfig, saveNotebookHome } from "@/state/chat-actions"
import { notebookHomeQueryOptions, setNotebookHomeQueryData } from "@/state/bootstrap-query"
import { useGeneralSettings } from "@/state/general-settings"
import {
  globalConfigQueryKeys,
  globalConfigQueryOptions,
  setGlobalConfigQueryData,
} from "@/state/global-config-query"
import { parseTNumber, parseTString } from "@/components/chat/tools/types"
import type { TBuddyConfigObject } from "@/state/parse-external"
import { ConfirmRemoveMathRuntimeDialog } from "./confirm-remove-math-runtime-dialog"
import { ConfirmRemoveStandardsRuntimeDialog } from "./confirm-remove-standards-runtime-dialog"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from "./settings-primitives"
import {
  AdvancedMathRuntimeControl,
  advancedMathRuntimeDescription,
} from "./advanced-math-runtime-control"
import { useAdvancedMathRuntime } from "./use-advanced-math-runtime"
import { useStandardsRuntime } from "./use-standards-runtime"
import {
  EXPERIMENTAL_FEATURE_ID,
  type ExperimentalFeatureID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
  updateExperimentalFeature,
} from "@/state/experimental-features-query"

const DEFAULT_LOG_LEVEL_VALUE = "__default__"
const ADVANCED_LOG_LEVELS = ["debug", "info", "warn", "error"] as const
const SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY = "skills_external_vendor_roots_enabled"
const EXPERIMENTAL_FEATURE_DEFINITIONS = [
  {
    id: EXPERIMENTAL_FEATURE_ID.learnerMemory,
    titleKey: "settings.advanced.learnerMemoryExperimentTitle",
    descriptionKey: "settings.advanced.learnerMemoryExperimentDescription",
    ariaKey: "settings.advanced.learnerMemoryExperimentAria",
    enabledMessageKey: "settings.advanced.learnerMemoryExperimentEnabled",
    disabledMessageKey: "settings.advanced.learnerMemoryExperimentDisabled",
  },
] as const satisfies readonly {
  id: ExperimentalFeatureID
  titleKey: string
  descriptionKey: string
  ariaKey: string
  enabledMessageKey: string
  disabledMessageKey: string
}[]

type AdvancedLogLevel = (typeof ADVANCED_LOG_LEVELS)[number]

function isAdvancedLogLevel(value: string): value is AdvancedLogLevel {
  return ADVANCED_LOG_LEVELS.some((level) => level === value)
}

export function AdvancedSettings() {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const openProjects = useChatStore((state) => state.openProjects)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const [logLevelDraft, setLogLevelDraft] = useState<string>(DEFAULT_LOG_LEVEL_VALUE)
  const [logLevelBusy, setLogLevelBusy] = useState(false)
  const [changingBuddyHome, setChangingBuddyHome] = useState(false)
  const generalSettings = useGeneralSettings({
    cleanupDirectories: openProjects,
  })
  const showGeneralSettingsRetry = Boolean(
    generalSettings.status.error && generalSettings.status.hasPendingChanges,
  )
  const notebookHomeQuery = useQuery(notebookHomeQueryOptions())
  const notebookHome = notebookHomeQuery.data
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const logLevelLoading = globalConfigQuery.isPending || globalConfigQuery.isFetching
  const logLevelSelectValue = logLevelDraft
  const showRuntimeControls = platform.platform === "desktop"
  const externalVendorRootsEnabled =
    globalConfigQuery.data?.[SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY] === true
  const skillsSettingsLoading = globalConfigQuery.isPending || globalConfigQuery.isFetching
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
    if (!globalConfigQuery.error) return

    const message =
      globalConfigQuery.error instanceof Error
        ? globalConfigQuery.error.message
        : language.t("settings.advanced.loadSettingsFailed")
    toast.error(message)
  }, [globalConfigQuery.error])

  useEffect(() => {
    if (!globalConfigQuery.data) return
    const level = parseTString(globalConfigQuery.data.logLevel)
    if (level !== undefined && isAdvancedLogLevel(level)) {
      setLogLevelDraft(level)
    } else {
      setLogLevelDraft(DEFAULT_LOG_LEVEL_VALUE)
    }
  }, [globalConfigQuery.data])

  function setExternalVendorRootsEnabled(enabled: boolean) {
    queryClient.setQueryData<TBuddyConfigObject | undefined>(
      globalConfigQueryKeys.bundle(),
      (current) =>
        current
          ? {
              ...current,
              [SKILLS_EXTERNAL_VENDOR_ROOTS_ENABLED_CONFIG_KEY]: enabled,
            }
          : current,
    )
  }

  async function handleLogLevelChange(value: string) {
    const previous = logLevelDraft
    setLogLevelDraft(value)
    setLogLevelBusy(true)
    try {
      const updatedGlobal = await patchGlobalConfig({ logLevel: value || null })
      setGlobalConfigQueryData(queryClient, updatedGlobal)
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
    if (externalVendorRootsEnabled === enabled) {
      return
    }

    void (async () => {
      const key = "settings:external-roots"
      const previous = externalVendorRootsEnabled
      setBusyKey(key)
      setExternalVendorRootsEnabled(enabled)

      try {
        const result = await updateSkillsSettings(enabled)
        setExternalVendorRootsEnabled(result.externalVendorRootsEnabled)
        await invalidateAllSkillsCatalogQueries(queryClient)
        toast.success(
          result.externalVendorRootsEnabled
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

  function toggleExperimentalFeature(
    definition: (typeof EXPERIMENTAL_FEATURE_DEFINITIONS)[number],
    enabled: boolean,
  ) {
    if (experimentalFeatureIsEnabled(experimentalFeaturesQuery.data, definition.id) === enabled) {
      return
    }

    void (async () => {
      const key = `settings:experiment:${definition.id}`
      setBusyKey(key)
      try {
        await updateExperimentalFeature({
          queryClient,
          featureID: definition.id,
          enabled,
        })
        toast.success(
          language.t(enabled ? definition.enabledMessageKey : definition.disabledMessageKey),
        )
      } catch (error) {
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
        <div className="flex flex-col gap-2">
          <SettingsSectionHeader
            title={language.t("settings.advanced.experimentalFeaturesTitle")}
            description={language.t("settings.advanced.experimentalFeaturesDescription")}
          />
          <SettingsListCard>
            {EXPERIMENTAL_FEATURE_DEFINITIONS.map((definition, index) => {
              const busyKeyForFeature = `settings:experiment:${definition.id}`
              return (
                <SettingsRow
                  key={definition.id}
                  title={language.t(definition.titleKey)}
                  description={language.t(definition.descriptionKey)}
                  last={index === EXPERIMENTAL_FEATURE_DEFINITIONS.length - 1}
                  control={
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="h-5 text-text-weak">
                        {language.t("settings.advanced.experimentalBadge")}
                      </Badge>
                      <Switch
                        data-action={`settings-experiment-${definition.id}`}
                        aria-label={language.t(definition.ariaKey)}
                        checked={experimentalFeatureIsEnabled(
                          experimentalFeaturesQuery.data,
                          definition.id,
                        )}
                        disabled={
                          experimentalFeaturesQuery.isPending ||
                          experimentalFeaturesQuery.isError ||
                          busyKey === busyKeyForFeature
                        }
                        onCheckedChange={(enabled) =>
                          toggleExperimentalFeature(definition, enabled)
                        }
                      />
                    </div>
                  }
                />
              )
            })}
          </SettingsListCard>
        </div>

        {showRuntimeControls ? (
          <div className="space-y-2">
            <SettingsSectionHeader title="Packages" />
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
                    parseTNumber(standardsStatus?.progressPercent) !== undefined ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-text-weak">
                          <span className="truncate">
                            {standardsStatus?.progressMessage ??
                              language.t("settings.appearance.working")}
                          </span>
                          {parseTNumber(standardsStatus?.progressPercent) !== undefined ? (
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

        <SettingsSection
          title="Behavior"
          headerAction={
            showGeneralSettingsRetry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={generalSettings.status.loading || generalSettings.status.saving}
                onClick={() => void generalSettings.actions.save()}
              >
                {language.t("settings.autosave.retry")}
              </Button>
            ) : undefined
          }
        >
          {generalSettings.status.error ? (
            <div className="px-4 py-3 text-xs text-icon-critical-base sm:px-5">
              {generalSettings.status.error}
            </div>
          ) : null}
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
                    {externalVendorRootsEnabled
                      ? language.t("settings.advanced.on")
                      : language.t("settings.advanced.off")}
                  </span>
                  <Switch
                    checked={externalVendorRootsEnabled}
                    onCheckedChange={toggleExternalVendorRoots}
                    disabled={skillsSettingsLoading || busyKey === "settings:external-roots"}
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
