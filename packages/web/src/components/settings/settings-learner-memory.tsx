import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"
import { language } from "@/context/language"
import { useGlobalLearnerMemorySettings } from "@/state/learner-memory-settings"
import {
  GlobalDefaultsSection,
  SettingsSwitchControl,
  SettingsSectionHeader,
  SettingsListCard,
  SettingsRow,
} from "./settings-primitives"

const MIN_EXTRACTION_DELAY_MS = 1_000
const EXTRACTION_DELAY_STEP_MS = 1_000
const AUTO_MODEL_VALUE = "__auto__"
const DEFAULT_OPENAI_EXTRACT_MODEL = "openai/gpt-5.4-mini"
const DEFAULT_OPENAI_CONSOLIDATION_MODEL = "openai/gpt-5.4"

type LearnerMemoryModelOption = {
  value: string
  label: string
  description: string
}

function NumberControl(props: {
  value: number
  min: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <Input
      type="number"
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => {
        const value = Number(event.currentTarget.value)
        if (Number.isFinite(value)) props.onChange(value)
      }}
    />
  )
}

function ModelSelectControl(props: {
  value: string
  options: LearnerMemoryModelOption[]
  autoDescription: string
  disabled?: boolean
  dataAction: string
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={props.value || AUTO_MODEL_VALUE}
      disabled={props.disabled}
      onValueChange={(value) => props.onChange(value === AUTO_MODEL_VALUE ? "" : value)}
    >
      <SelectTrigger data-action={props.dataAction} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_MODEL_VALUE}>
          {language.t("settings.teaching.memoryModelAuto", { description: props.autoDescription })}
        </SelectItem>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function modelOptionsWithCurrent(
  options: LearnerMemoryModelOption[],
  currentValue: string,
): LearnerMemoryModelOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options
  return [
    {
      value: currentValue,
      label: language.t("settings.teaching.memoryModelCurrent", { model: currentValue }),
      description: currentValue,
    },
    ...options,
  ]
}

export function LearnerMemorySettingsSections() {
  const settings = useGlobalLearnerMemorySettings()
  const globalControlsDisabled = settings.status.loading
  const showRetry = Boolean(settings.status.error && settings.status.hasPendingChanges)
  const modelOptions: LearnerMemoryModelOption[] = settings.options.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}/${model.id}`,
      label: `${provider.name} · ${model.name}`,
      description: model.id,
    })),
  )

  return (
    <>
      <SettingsSectionHeader
        title={language.t("settings.teaching.memorySection")}
        description={language.t("settings.teaching.memorySectionDescription")}
        badge={language.t("settings.advanced.experimentalBadge")}
      />
      <GlobalDefaultsSection
        description={language.t("settings.teaching.memoryDefaultsDescription")}
        headerAction={
          showRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={settings.status.loading || settings.status.saving}
              onClick={() => void settings.actions.save()}
            >
              {language.t("settings.autosave.retry")}
            </Button>
          ) : undefined
        }
      >
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.teaching.memoryParticipationTitle")}
            description={language.t("settings.teaching.memoryParticipationDescription")}
            control={
              <SettingsSwitchControl
                dataAction="settings-global-learner-memory-default"
                checked={settings.selection.learnerMemoryDefaultEnabled}
                onCheckedChange={settings.actions.setLearnerMemoryDefaultEnabled}
                disabled={globalControlsDisabled}
                ariaLabel={language.t("settings.teaching.memoryParticipationAria")}
                onLabel={language.t("settings.notebook.on")}
                offLabel={language.t("settings.notebook.off")}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryAutoExtractTitle")}
            description={language.t("settings.teaching.memoryAutoExtractDescription")}
            control={
              <SettingsSwitchControl
                dataAction="settings-global-learner-memory-auto-default"
                checked={settings.selection.learnerMemoryDefaultAutoExtract}
                onCheckedChange={settings.actions.setLearnerMemoryDefaultAutoExtract}
                disabled={globalControlsDisabled || !settings.selection.learnerMemoryDefaultEnabled}
                ariaLabel={language.t("settings.teaching.memoryAutoExtractAria")}
                onLabel={language.t("settings.notebook.on")}
                offLabel={language.t("settings.notebook.off")}
              />
            }
          />
        </SettingsListCard>
        {settings.status.error ? (
          <p className="px-1 text-xs text-icon-critical-base">{settings.status.error}</p>
        ) : null}
      </GlobalDefaultsSection>

      <GlobalDefaultsSection description={language.t("settings.teaching.memoryModelsDescription")}>
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.teaching.memoryExtractModelTitle")}
            description={language.t("settings.teaching.memoryExtractModelDescription")}
            control={
              <ModelSelectControl
                dataAction="settings-learner-memory-extract-model"
                value={settings.selection.learnerMemoryExtractModel}
                options={modelOptionsWithCurrent(
                  modelOptions,
                  settings.selection.learnerMemoryExtractModel,
                )}
                autoDescription={language.t("settings.teaching.memoryExtractModelAuto", {
                  model: DEFAULT_OPENAI_EXTRACT_MODEL,
                })}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryModel("learnerMemoryExtractModel", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryConsolidationModelTitle")}
            description={language.t("settings.teaching.memoryConsolidationModelDescription")}
            control={
              <ModelSelectControl
                dataAction="settings-learner-memory-consolidation-model"
                value={settings.selection.learnerMemoryConsolidationModel}
                options={modelOptionsWithCurrent(
                  modelOptions,
                  settings.selection.learnerMemoryConsolidationModel,
                )}
                autoDescription={language.t("settings.teaching.memoryConsolidationModelAuto", {
                  model: DEFAULT_OPENAI_CONSOLIDATION_MODEL,
                })}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryModel("learnerMemoryConsolidationModel", value)
                }
              />
            }
          />
        </SettingsListCard>
      </GlobalDefaultsSection>

      <GlobalDefaultsSection description={language.t("settings.teaching.memoryTuningDescription")}>
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.teaching.memoryMinMessagesTitle")}
            description={language.t("settings.teaching.memoryMinMessagesDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryMinUserMessages}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber("learnerMemoryMinUserMessages", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryStartupIdleTitle")}
            description={language.t("settings.teaching.memoryStartupIdleDescription")}
            control={
              <NumberControl
                min={MIN_EXTRACTION_DELAY_MS}
                step={EXTRACTION_DELAY_STEP_MS}
                value={settings.selection.learnerMemoryMinStartupIdleMs}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber("learnerMemoryMinStartupIdleMs", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryAttentionTitle")}
            description={language.t("settings.teaching.memoryAttentionDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryAttentionThreshold}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber("learnerMemoryAttentionThreshold", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memorySessionCapTitle")}
            description={language.t("settings.teaching.memorySessionCapDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryMaxExtractionCallsPerSession}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber(
                    "learnerMemoryMaxExtractionCallsPerSession",
                    value,
                  )
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryDailyCapTitle")}
            description={language.t("settings.teaching.memoryDailyCapDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryMaxExtractionCallsPerDay}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber(
                    "learnerMemoryMaxExtractionCallsPerDay",
                    value,
                  )
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryContextLimitTitle")}
            description={language.t("settings.teaching.memoryContextLimitDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryDefaultContextLimit}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber("learnerMemoryDefaultContextLimit", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryConcurrencyTitle")}
            description={language.t("settings.teaching.memoryConcurrencyDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryStartupConcurrency}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber("learnerMemoryStartupConcurrency", value)
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryConsolidationCapTitle")}
            description={language.t("settings.teaching.memoryConsolidationCapDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryMaxRawMemoriesForConsolidation}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber(
                    "learnerMemoryMaxRawMemoriesForConsolidation",
                    value,
                  )
                }
              />
            }
          />
          <SettingsRow
            title={language.t("settings.teaching.memoryRetentionTitle")}
            description={language.t("settings.teaching.memoryRetentionDescription")}
            control={
              <NumberControl
                min={1}
                value={settings.selection.learnerMemoryMaxUnusedStageOneDays}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryNumber(
                    "learnerMemoryMaxUnusedStageOneDays",
                    value,
                  )
                }
              />
            }
          />
        </SettingsListCard>
      </GlobalDefaultsSection>
    </>
  )
}
