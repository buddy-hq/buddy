import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@buddy/ui"
import { useForm } from "@tanstack/react-form"
import { language } from "@/context/language"
import { parseTString } from "@/components/chat/tools/types"
import { pickProjectDirectory } from "@/lib/directory-picker"
import { patchGlobalConfig, saveNotebookHome } from "@/state/chat-actions"
import { notebookHomeQueryOptions, setNotebookHomeQueryData } from "@/state/bootstrap-query"
import { globalConfigQueryOptions, setGlobalConfigQueryData } from "@/state/global-config-query"
import { readPersonalization } from "@/state/project-config-readers"
import { usePersonalizationSettingsAutosave } from "@/state/personalization-settings"
import { SharedPersonalizationPrimaryUseField } from "./shared-personalization-form"
import {
  FOLLOWUP_BEHAVIOR_QUEUE,
  FOLLOWUP_BEHAVIOR_STEER,
  useChatSettings,
  type FollowupBehavior,
} from "@/state/chat-settings"
import { useConciseResponseSettings } from "@/state/concise-response-settings"
import {
  GAME_PROMPT_PREFERENCE_DISABLED,
  GAME_PROMPT_PREFERENCE_REDUCED,
  GAME_PROMPT_PREFERENCE_STANDARD,
  useGameStore,
  type TGamePromptPreference,
} from "@/state/game-store"
import { useGeneralSettings } from "@/state/general-settings"
import { useGetStartedFlowStore } from "@/state/get-started-flow-store"
import { useChatStore } from "@/state/chat-store"
import {
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from "./settings-primitives"

const DEFAULT_LOG_LEVEL_VALUE = "__default__"
const ADVANCED_LOG_LEVELS = ["debug", "info", "warn", "error"] as const

type AdvancedLogLevel = (typeof ADVANCED_LOG_LEVELS)[number]

function isAdvancedLogLevel(value: string): value is AdvancedLogLevel {
  return ADVANCED_LOG_LEVELS.some((level) => level === value)
}

function isFollowupBehavior(value: string): value is FollowupBehavior {
  return value === FOLLOWUP_BEHAVIOR_STEER || value === FOLLOWUP_BEHAVIOR_QUEUE
}

function isGamePromptPreference(value: string): value is TGamePromptPreference {
  return (
    value === GAME_PROMPT_PREFERENCE_STANDARD ||
    value === GAME_PROMPT_PREFERENCE_REDUCED ||
    value === GAME_PROMPT_PREFERENCE_DISABLED
  )
}

export function GeneralSettings() {
  const openProjects = useChatStore((state) => state.openProjects)
  const followupBehavior = useChatSettings((state) => state.followupBehavior)
  const setFollowupBehavior = useChatSettings((state) => state.setFollowupBehavior)
  const gamePromptPreference = useGameStore((state) => state.gamePromptPreference)
  const setGamePromptPreference = useGameStore((state) => state.setGamePromptPreference)
  const getStartedFlowEnabled = useGetStartedFlowStore((state) => state.enabled)
  const setGetStartedFlowEnabled = useGetStartedFlowStore((state) => state.setEnabled)
  const conciseResponses = useConciseResponseSettings()
  const queryClient = useQueryClient()
  const [changingBuddyHome, setChangingBuddyHome] = useState(false)
  const [logLevelDraft, setLogLevelDraft] = useState<string>(DEFAULT_LOG_LEVEL_VALUE)
  const [logLevelBusy, setLogLevelBusy] = useState(false)
  const notebookHomeQuery = useQuery(notebookHomeQueryOptions())
  const notebookHome = notebookHomeQuery.data
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const personalizationForm = useForm({
    defaultValues: readPersonalization(globalConfigQuery.data ?? {}),
    onSubmit: async () => undefined,
  })
  const { save: savePersonalization } = usePersonalizationSettingsAutosave(personalizationForm, {
    globalConfig: globalConfigQuery.data,
    isPending: globalConfigQuery.isPending,
  })
  const logLevelLoading = globalConfigQuery.isPending || globalConfigQuery.isFetching
  const logLevelSelectValue = logLevelDraft
  const generalSettings = useGeneralSettings({ cleanupDirectories: openProjects })
  const showGeneralSettingsRetry = Boolean(
    generalSettings.status.error && generalSettings.status.hasPendingChanges,
  )

  useEffect(() => {
    if (!globalConfigQuery.error) return
    toast.error(
      globalConfigQuery.error instanceof Error
        ? globalConfigQuery.error.message
        : language.t("settings.advanced.loadSettingsFailed"),
    )
  }, [globalConfigQuery.error])

  useEffect(() => {
    if (!globalConfigQuery.data) return
    const level = parseTString(globalConfigQuery.data.logLevel)
    setLogLevelDraft(
      level !== undefined && isAdvancedLogLevel(level) ? level : DEFAULT_LOG_LEVEL_VALUE,
    )
  }, [globalConfigQuery.data])

  async function handleLogLevelChange(value: string) {
    const previous = logLevelDraft
    setLogLevelDraft(value)
    setLogLevelBusy(true)
    try {
      const updatedGlobal = await patchGlobalConfig({ logLevel: value || null })
      setGlobalConfigQueryData(queryClient, updatedGlobal)
    } catch (error) {
      setLogLevelDraft(previous)
      toast.error(
        error instanceof Error ? error.message : language.t("settings.advanced.requestFailed"),
      )
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

  const followupBehaviorOptions: ReadonlyArray<{ value: FollowupBehavior; label: string }> = [
    {
      value: FOLLOWUP_BEHAVIOR_STEER,
      label: language.t("settings.general.followupSteerOption"),
    },
    {
      value: FOLLOWUP_BEHAVIOR_QUEUE,
      label: language.t("settings.general.followupQueueOption"),
    },
  ]

  const gamePromptPreferenceOptions: ReadonlyArray<{
    value: TGamePromptPreference
    label: string
  }> = [
    {
      value: GAME_PROMPT_PREFERENCE_STANDARD,
      label: language.t("settings.general.gamePromptStandardOption"),
    },
    {
      value: GAME_PROMPT_PREFERENCE_REDUCED,
      label: language.t("settings.general.gamePromptReducedOption"),
    },
    {
      value: GAME_PROMPT_PREFERENCE_DISABLED,
      label: language.t("settings.general.gamePromptDisabledOption"),
    },
  ]

  return (
    <SettingsContent>
      <SettingsSection
        title={language.t("settings.chat.conversationSection")}
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
        <SettingsRow
          title={language.t("settings.general.getStartedChatsTitle")}
          description={language.t("settings.general.getStartedChatsDescription")}
          control={
            <Switch
              data-action="settings-get-started-chats"
              checked={getStartedFlowEnabled}
              onCheckedChange={setGetStartedFlowEnabled}
              aria-label={language.t("settings.general.getStartedChatsAria")}
            />
          }
        />
        <SettingsRow
          title={language.t("settings.general.followupTitle")}
          description={language.t("settings.general.followupDescription")}
          control={
            <Select
              value={followupBehavior}
              onValueChange={(value) => {
                if (isFollowupBehavior(value)) {
                  setFollowupBehavior(value)
                }
              }}
            >
              <SelectTrigger data-action="settings-followup-behavior" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {followupBehaviorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          title={language.t("settings.general.gamePromptTitle")}
          description={language.t("settings.general.gamePromptDescription")}
          control={
            <Select
              value={gamePromptPreference}
              onValueChange={(value) => {
                if (isGamePromptPreference(value)) {
                  setGamePromptPreference(value)
                }
              }}
            >
              <SelectTrigger data-action="settings-game-prompt-preference" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gamePromptPreferenceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          title={language.t("settings.personalization.conciseResponsesTitle")}
          description={language.t("settings.personalization.conciseResponsesDescription")}
          control={
            <Switch
              data-action="settings-concise-responses"
              checked={conciseResponses.enabled}
              onCheckedChange={conciseResponses.setEnabled}
              disabled={conciseResponses.loading || conciseResponses.saving}
              aria-label={language.t("settings.personalization.conciseResponsesAria")}
            />
          }
        />
        {generalSettings.status.error ? (
          <div className="px-4 py-3 text-xs text-icon-critical-base sm:px-5">
            {generalSettings.status.error}
          </div>
        ) : null}
        <SettingsRow
          title={language.t("settings.general.fullTextTitle")}
          description={language.t("settings.general.fullTextDescription")}
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
          description={language.t("settings.general.autoCompactionDescription")}
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
      </SettingsSection>
      {conciseResponses.error ? (
        <p className="px-1 text-sm text-text-critical-base">{conciseResponses.error}</p>
      ) : null}

      <SettingsSection title={language.t("settings.general.storageSection")}>
          <SettingsRow
            title={language.t("settings.general.buddyHomeTitle")}
            description={
              notebookHome?.resolvedDirectory
                ? `${language.t("settings.general.buddyHomeDescription")} (${notebookHome.resolvedDirectory})`
                : language.t("settings.general.buddyHomeDescription")
            }
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
          title={language.t("settings.labs.diagnosticsSection")}
          description={language.t("settings.advanced.logLevelDescription")}
        />
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.advanced.logLevelTitle")}
            description={language.t("settings.advanced.logLevelDescription")}
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

      <div className="space-y-2.5">
        <SettingsSectionHeader title={language.t("settings.personalization.primaryUseTitle")} />
        <SharedPersonalizationPrimaryUseField
          form={personalizationForm}
          onPrimaryUseChange={() => void savePersonalization()}
        />
      </div>
    </SettingsContent>
  )
}
