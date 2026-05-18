import { useQuery } from "@tanstack/react-query"
import type {
  LearnerMemoryListResponses,
  LearnerMemoryPipelineDiagnosticsResponses,
} from "@buddy/sdk"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@buddy/ui"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { useNotebookSettingsWorkbench } from "@/state/project-settings"
import {
  EffectiveBehaviorSection,
  GlobalDefaultsSection,
  NotebookCustomizationSection,
  SettingsContent,
  SettingsListCard,
  SettingsRow,
} from "./settings-primitives"
import type { SettingsWorkbench } from "./settings-workbench"

const LEARNER_MEMORY_QUERY_KEY = "learner-memory-settings-panel"
const LEARNER_MEMORY_PANEL_LIMIT = 12
const LEARNER_MEMORY_USER_REASON = "Updated from learner memory settings"
const MIN_EXTRACTION_DELAY_MS = 1_000
const EXTRACTION_DELAY_STEP_MS = 1_000
const AUTO_MODEL_VALUE = "__auto__"
const DEFAULT_OPENAI_EXTRACT_MODEL = "openai/gpt-5.4-mini"
const DEFAULT_OPENAI_CONSOLIDATION_MODEL = "openai/gpt-5.4"

type LearnerMemoryRecord = LearnerMemoryListResponses[200]["memories"][number]
type LearnerMemoryPipelineDiagnostics = LearnerMemoryPipelineDiagnosticsResponses[200]
type LearnerMemoryModelOption = {
  value: string
  label: string
  description: string
}

function memoryScopeLabel(directory: string, memory: LearnerMemoryRecord): string {
  if (!memory.projectPath) return "Global"
  return memory.projectPath === directory ? "This notebook" : "Other notebook"
}

function LearnerMemoryToggleControl(props: {
  checked: boolean
  disabled?: boolean
  dataAction: string
  ariaLabel: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/60 px-3 py-2">
      <span className="text-sm text-text-weak">
        {props.checked ? language.t("settings.notebook.on") : language.t("settings.notebook.off")}
      </span>
      <Switch
        data-action={props.dataAction}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
      />
    </div>
  )
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

function LearnerMemoryPanel(props: { directory: string; enabled: boolean }) {
  const query = useQuery({
    queryKey: [LEARNER_MEMORY_QUERY_KEY, props.directory],
    enabled: props.enabled,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.list({
          directory: props.directory,
        }),
      ),
  })
  const pipelineQuery = useQuery({
    queryKey: [LEARNER_MEMORY_QUERY_KEY, "pipeline", props.directory],
    enabled: props.enabled,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).learner.memory.pipeline.diagnostics({
          directory: props.directory,
        }),
      ),
  })

  async function updateMemory(action: () => Promise<unknown>): Promise<void> {
    await action()
    await query.refetch()
    await pipelineQuery.refetch()
  }

  const memories =
    query.data?.memories
      .filter((memory) => memory.status !== "hidden" && memory.status !== "rejected")
      .slice(0, LEARNER_MEMORY_PANEL_LIMIT) ?? []

  return (
    <div className="space-y-3 rounded-lg border border-border-base/60 bg-bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-base">Learner memory records</div>
          <div className="text-xs text-text-weak">
            Inspect global learner memories, scoped by notebook metadata when available.
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!props.enabled || query.isFetching}
          onClick={() => {
            void query.refetch()
            void pipelineQuery.refetch()
          }}
        >
          Refresh
        </Button>
      </div>
      {props.enabled && pipelineQuery.data ? (
        <LearnerMemoryPipelineSummary diagnostics={pipelineQuery.data} />
      ) : null}
      {!props.enabled ? (
        <div className="rounded-md border border-border-base/60 p-3 text-sm text-text-weak">
          Enable learner memory for this notebook to inspect records.
        </div>
      ) : query.isPending ? (
        <div className="rounded-md border border-border-base/60 p-3 text-sm text-text-weak">
          Loading learner memory...
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-md border border-border-base/60 p-3 text-sm text-text-weak">
          No active learner memories yet.
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <div key={memory.id} className="rounded-md border border-border-base/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-base">
                    {memory.pinned ? "Pinned: " : ""}
                    {memory.title}
                  </div>
                  <div className="mt-1 text-xs text-text-weak">
                    {memory.type} · {memory.memoryType} ·{" "}
                    {memoryScopeLabel(props.directory, memory)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void updateMemory(() =>
                        getBuddyClient(props.directory).learner.memory.pin({
                          directory: props.directory,
                          memoryId: memory.id,
                          pinned: !memory.pinned,
                          reason: LEARNER_MEMORY_USER_REASON,
                        }),
                      )
                    }
                  >
                    {memory.pinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void updateMemory(() =>
                        getBuddyClient(props.directory).learner.memory.hide({
                          directory: props.directory,
                          memoryId: memory.id,
                          reason: LEARNER_MEMORY_USER_REASON,
                        }),
                      )
                    }
                  >
                    Hide
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void updateMemory(() =>
                        getBuddyClient(props.directory).learner.memory.delete({
                          directory: props.directory,
                          memoryId: memory.id,
                          reason: LEARNER_MEMORY_USER_REASON,
                        }),
                      )
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-text-weak">{memory.body}</p>
              <div className="mt-2 text-xs text-text-weak">
                {memory.sourceEventIds.length > 0
                  ? `Sources: ${memory.sourceEventIds.join(", ")}`
                  : "No source pointers"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LearnerMemoryPipelineSummary(props: { diagnostics: LearnerMemoryPipelineDiagnostics }) {
  const phaseTwo = props.diagnostics.phaseTwoJob
  return (
    <div className="grid gap-2 rounded-md border border-border-base/60 p-3 text-xs text-text-weak md:grid-cols-3">
      <div>
        <div className="font-medium text-text-base">Pipeline</div>
        <div>Stage-one outputs: {props.diagnostics.stageOneOutputs.length}</div>
        <div>Input watermark: {props.diagnostics.inputWatermarkMs || "none"}</div>
      </div>
      <div>
        <div className="font-medium text-text-base">Budget</div>
        <div>Today: {props.diagnostics.budget.todayCount}</div>
        <div>Total: {props.diagnostics.budget.totalCount}</div>
      </div>
      <div>
        <div className="font-medium text-text-base">Consolidation</div>
        <div>Attempts: {phaseTwo?.attemptCount ?? 0}</div>
        <div>Last failure: {phaseTwo?.lastFailure ?? "none"}</div>
      </div>
    </div>
  )
}

export function LearnerMemorySettings({ workbench }: { workbench: SettingsWorkbench }) {
  const directory = workbench.selectedDirectory
  const settings = useNotebookSettingsWorkbench(directory, workbench.hasSelectedNotebook)
  const globalControlsDisabled = settings.status.loading
  const notebookControlsDisabled =
    settings.status.loading || !settings.selection.learnerMemoryMasterEnabled
  const autoExtractDisabled =
    settings.status.loading ||
    !settings.selection.learnerMemoryMasterEnabled ||
    !settings.selection.learnerMemoryEnabled
  const modelOptions: LearnerMemoryModelOption[] = settings.options.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}/${model.id}`,
      label: `${provider.name} · ${model.name}`,
      description: model.id,
    })),
  )

  return (
    <SettingsContent>
      <GlobalDefaultsSection description="These controls apply to Buddy's learner memory system across notebooks.">
        <SettingsListCard>
          <SettingsRow
            title="Global learner memory"
            description="Master switch for Buddy's learner memory store on this machine. When off, no notebook can use memory or run extraction."
            last
            control={
              <LearnerMemoryToggleControl
                dataAction="settings-global-learner-memory"
                checked={settings.selection.learnerMemoryMasterEnabled}
                onCheckedChange={settings.actions.setLearnerMemoryMasterEnabled}
                disabled={settings.status.loading}
                ariaLabel="Enable global learner memory"
              />
            }
          />
        </SettingsListCard>
      </GlobalDefaultsSection>

      <NotebookCustomizationSection
        workbench={workbench}
        description="These controls decide whether the selected notebook participates in global learner memory."
      >
        <SettingsListCard>
          <SettingsRow
            title={language.t("settings.notebook.learnerMemoryTitle")}
            description={language.t("settings.notebook.learnerMemoryDescription")}
            control={
              <LearnerMemoryToggleControl
                dataAction="settings-notebook-learner-memory"
                checked={settings.selection.learnerMemoryEnabled}
                onCheckedChange={settings.actions.setLearnerMemoryEnabled}
                disabled={notebookControlsDisabled}
                ariaLabel={language.t("settings.notebook.learnerMemoryAria")}
              />
            }
          />
          <SettingsRow
            title={language.t("settings.notebook.learnerMemoryAutoExtractTitle")}
            description={language.t("settings.notebook.learnerMemoryAutoExtractDescription")}
            last
            control={
              <LearnerMemoryToggleControl
                dataAction="settings-notebook-learner-memory-auto"
                checked={settings.selection.learnerMemoryAutoExtract}
                onCheckedChange={settings.actions.setLearnerMemoryAutoExtract}
                disabled={autoExtractDisabled}
                ariaLabel={language.t("settings.notebook.learnerMemoryAutoExtractAria")}
              />
            }
          />
        </SettingsListCard>
      </NotebookCustomizationSection>

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

      <EffectiveBehaviorSection description="This shows the learner memories Buddy can currently use for the selected notebook.">
        <LearnerMemoryPanel
          directory={directory}
          enabled={
            workbench.hasSelectedNotebook &&
            settings.selection.learnerMemoryMasterEnabled &&
            settings.selection.learnerMemoryEnabled
          }
        />
      </EffectiveBehaviorSection>
    </SettingsContent>
  )
}
