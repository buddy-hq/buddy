import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@buddy/ui"
import { language } from "@/context/language"
import { useGlobalLearnerMemorySettings } from "@/state/learner-memory-settings"
import {
  GlobalDefaultsSection,
  SettingsContent,
  SettingsListCard,
  SettingsRow,
  SettingsSwitchControl,
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
    <input
      type="number"
      className="h-9 w-full rounded-md border border-border-base/60 bg-background-base px-3 text-sm text-text-base disabled:cursor-not-allowed disabled:opacity-50"
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
        <SelectItem value={AUTO_MODEL_VALUE}>Auto · {props.autoDescription}</SelectItem>
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
      label: `Current · ${currentValue}`,
      description: currentValue,
    },
    ...options,
  ]
}

export function LearnerMemorySettings() {
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
    <SettingsContent>
      <GlobalDefaultsSection
        description="These controls apply to Buddy's learner memory system across every notebook. Notebook-specific overrides now live in notebook settings."
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
            title="Global learner memory"
            description="Master switch for Buddy's learner memory store on this machine. When off, no notebook can use memory or run extraction."
            control={
              <SettingsSwitchControl
                dataAction="settings-global-learner-memory"
                checked={settings.selection.learnerMemoryMasterEnabled}
                onCheckedChange={settings.actions.setLearnerMemoryMasterEnabled}
                disabled={globalControlsDisabled}
                ariaLabel="Enable global learner memory"
                onLabel={language.t("settings.notebook.on")}
                offLabel={language.t("settings.notebook.off")}
              />
            }
          />
          <SettingsRow
            title="Default notebook participation"
            description="Controls whether newly created and unchanged notebooks use learner memory by default."
            control={
              <SettingsSwitchControl
                dataAction="settings-global-learner-memory-default"
                checked={settings.selection.learnerMemoryDefaultEnabled}
                onCheckedChange={settings.actions.setLearnerMemoryDefaultEnabled}
                disabled={globalControlsDisabled || !settings.selection.learnerMemoryMasterEnabled}
                ariaLabel="Enable learner memory by default for notebooks"
                onLabel={language.t("settings.notebook.on")}
                offLabel={language.t("settings.notebook.off")}
              />
            }
          />
          <SettingsRow
            title="Default auto-extract"
            description="Controls whether unchanged notebooks automatically extract learner memory from chats by default."
            last
            control={
              <SettingsSwitchControl
                dataAction="settings-global-learner-memory-auto-default"
                checked={settings.selection.learnerMemoryDefaultAutoExtract}
                onCheckedChange={settings.actions.setLearnerMemoryDefaultAutoExtract}
                disabled={
                  globalControlsDisabled ||
                  !settings.selection.learnerMemoryMasterEnabled ||
                  !settings.selection.learnerMemoryDefaultEnabled
                }
                ariaLabel="Enable learner memory auto-extract by default for notebooks"
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

      <GlobalDefaultsSection description="Model defaults are global because extraction and consolidation write to one machine-local memory store.">
        <SettingsListCard>
          <SettingsRow
            title="Extraction model"
            description="Small model used to read an idle chat and produce raw learner-memory candidates."
            control={
              <ModelSelectControl
                dataAction="settings-learner-memory-extract-model"
                value={settings.selection.learnerMemoryExtractModel}
                options={modelOptionsWithCurrent(
                  modelOptions,
                  settings.selection.learnerMemoryExtractModel,
                )}
                autoDescription={`${DEFAULT_OPENAI_EXTRACT_MODEL} when OpenAI is connected, otherwise a connected small model`}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryModel("learnerMemoryExtractModel", value)
                }
              />
            }
          />
          <SettingsRow
            title="Consolidation model"
            description="Model used to compare candidates against existing memories before writing durable records."
            last
            control={
              <ModelSelectControl
                dataAction="settings-learner-memory-consolidation-model"
                value={settings.selection.learnerMemoryConsolidationModel}
                options={modelOptionsWithCurrent(
                  modelOptions,
                  settings.selection.learnerMemoryConsolidationModel,
                )}
                autoDescription={`${DEFAULT_OPENAI_CONSOLIDATION_MODEL} when OpenAI is connected, otherwise the notebook default model`}
                disabled={globalControlsDisabled}
                onChange={(value) =>
                  settings.actions.setLearnerMemoryModel("learnerMemoryConsolidationModel", value)
                }
              />
            }
          />
        </SettingsListCard>
      </GlobalDefaultsSection>

      <GlobalDefaultsSection description="Extraction tuning is global so the learner-memory pipeline behaves consistently across notebooks.">
        <SettingsListCard>
          <SettingsRow
            title="Minimum user messages"
            description="Minimum non-synthetic learner messages before automatic extraction can run."
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
            title="Startup idle threshold"
            description="Minimum idle time in milliseconds before a session is eligible at notebook startup."
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
            title="Attention threshold"
            description="Higher values make automatic extraction less likely."
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
            title="Per-session call cap"
            description="Maximum extraction model calls allowed for the same session."
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
            title="Daily call cap"
            description="Maximum extraction model calls allowed globally per day."
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
            title="Default context limit"
            description="Maximum memories Buddy retrieves by default when no tool limit is provided."
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
            title="Startup concurrency"
            description="Maximum extraction jobs Buddy runs in parallel during notebook startup."
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
            title="Consolidation input cap"
            description="Maximum raw stage-one outputs considered during consolidation."
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
            title="Stage-one retention days"
            description="Old unselected extraction outputs are pruned after this many days."
            last
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
    </SettingsContent>
  )
}
