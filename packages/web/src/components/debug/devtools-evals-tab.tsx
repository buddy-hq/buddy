import { useEffect, useMemo, useState } from "react"
import {
  Button,
  Card,
  CardContent,
  CheckIcon,
  Checkbox,
  CopyIcon,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Z_INDEX,
} from "@buddy/ui"
import { copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import { modelSelectionKey } from "@/lib/directory-chat/chat-prompt-helpers"
import { resolveProviderModelGroup } from "@/lib/directory-chat/use-directory-chat-state"
import { useEvalDriverStore } from "@/lib/evals/eval-driver-store"
import { buildEvalQueue, startEvalRun, stopEvalRun, useEvalRunStore } from "@/lib/evals/eval-run-store"
import type { EvalCaseResult } from "@/lib/evals/run-teaching-eval"
import {
  TEACHING_EVAL_CASES,
  type EvalCheckStatus,
  type EvalTurnRecord,
} from "@/lib/evals/teaching-evals"
import { getUsableProviders } from "@/lib/provider-catalog"
import { useChatStore } from "@/state/chat-store"
import type { ProviderInfo } from "@/state/chat-types"

const EFFORT_SELECT_ID = "devtools-evals-effort"
const LEARNER_MODEL_SELECT_ID = "devtools-evals-learner-model"
const REPEATS_SELECT_ID = "devtools-evals-repeats"
const DEFAULT_EFFORT = "default"
const REPEAT_OPTIONS = ["1", "2", "3"]
const COPY_FEEDBACK_DURATION_MS = 1_200
const REPLY_PREVIEW_CHARS = 280
const FREE_MODEL_GROUP_PATTERN = /free/i
const EMPTY_PROVIDERS: ProviderInfo[] = []
const PHASE_LABELS = {
  starting: "starting a new chat",
  sending: "sending",
  waiting: "waiting for Buddy",
  answering: "learner answering Buddy's question",
  learner: "learner writing",
  reading: "reading the transcript",
} as const

type EvalModelOption = {
  key: string
  label: string
  group: string
  variants: string[]
}

function checkStatusClass(status: EvalCheckStatus) {
  switch (status) {
    case "pass":
      return "bg-surface-success-base text-text-success-base"
    case "fail":
      return "bg-surface-critical-base/20 text-icon-critical-base"
    case "review":
      return "bg-surface-warning-base/20 text-text-warning-base"
  }
}

function buildModelOptions(providers: ProviderInfo[]): EvalModelOption[] {
  return getUsableProviders(providers).flatMap((provider) =>
    provider.models.map((model) => ({
      key: modelSelectionKey({ providerID: provider.id, modelID: model.id }),
      label: model.name || model.id,
      group: resolveProviderModelGroup(provider),
      variants: model.variants,
    })),
  )
}

function groupModelOptions(options: EvalModelOption[]) {
  const groups = new Map<string, EvalModelOption[]>()
  for (const option of options) {
    groups.set(option.group, [...(groups.get(option.group) ?? []), option])
  }
  return [...groups.entries()]
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function shortModel(key: string) {
  return key.split("/").slice(1).join("/") || key
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function TurnRow(props: { turn: EvalTurnRecord; index: number }) {
  const { turn, index } = props
  const reply =
    turn.fullReply.length > REPLY_PREVIEW_CHARS
      ? `${turn.fullReply.slice(0, REPLY_PREVIEW_CHARS)}…`
      : turn.fullReply
  return (
    <div className="space-y-1 border-t border-border-weaker-base pt-2 text-[11px]">
      <p className="font-medium text-text-base">
        {index + 1}. {turn.prompt}
      </p>
      <p className="text-text-weak">
        <span className="text-text-weaker">Skills:</span> {turn.skills.join(", ") || "none"}
      </p>
      <p className="text-text-weak">
        <span className="text-text-weaker">Tools:</span> {turn.tools.join(", ") || "none"}
      </p>
      {turn.shown.length > 0 ? (
        <p className="text-text-weak">
          <span className="text-text-weaker">Showed:</span> {turn.shown.join("; ")}
        </p>
      ) : null}
      <p className="text-text-weak">
        <span className="text-text-weaker">Bench the model saw:</span> {turn.benchSeen}
        {turn.variant ? <span className="text-text-weaker"> · effort {turn.variant}</span> : null}
      </p>
      {turn.error ? <p className="text-icon-critical-base">{turn.error}</p> : null}
      <p className="whitespace-pre-wrap text-text-weaker">{reply || "No reply text."}</p>
    </div>
  )
}

function ResultCard(props: { result: EvalCaseResult }) {
  const { result } = props
  const [expanded, setExpanded] = useState(false)
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-text-base">
            {result.title}
            <span className="text-text-weaker"> · run {result.repeat}</span>
          </p>
          <p className="text-[11px] text-text-weaker">
            {formatElapsed(result.finishedAt - result.startedAt)} · {shortModel(result.config.buddyModel)} ·
            effort {result.config.effort}
            {result.kind === "simulated" ? ` · learner ${shortModel(result.config.learnerModel)}` : ""}
          </p>
        </div>
        {result.error ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {result.error}
          </p>
        ) : null}
        <div className="space-y-1">
          {result.checks.map((check) => (
            <div key={check.label} className="flex items-start gap-2 text-[11px]">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-medium uppercase ${checkStatusClass(check.status)}`}
              >
                {check.status}
              </span>
              <span className="text-text-base">{check.label}</span>
              <span className="text-text-weaker">{check.detail}</span>
            </div>
          ))}
        </div>
        {result.outcome.questionAnswers.length > 0 ? (
          <div className="space-y-0.5 text-[11px] text-text-weak">
            {result.outcome.questionAnswers.map((item) => (
              <p key={`${item.turnIndex}-${item.question}`}>
                <span className="text-text-weaker">Buddy asked on turn {item.turnIndex + 1}:</span>{" "}
                {item.question} <span className="text-text-weaker">→</span> {item.answer}
              </p>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide turns" : `Show ${result.turns.length} turns`}
          </Button>
          {result.sessionID ? (
            <span className="text-[11px] text-text-weaker">Session {result.sessionID}</span>
          ) : null}
        </div>
        {expanded ? (
          <div className="space-y-2">
            {result.turns.map((turn, index) => (
              <TurnRow key={turn.id} turn={turn} index={index} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SummaryGrid(props: { results: EvalCaseResult[] }) {
  const models = [...new Set(props.results.map((result) => result.config.buddyModel))]
  const cases = TEACHING_EVAL_CASES.filter((evalCase) =>
    props.results.some((result) => result.caseID === evalCase.id),
  )
  if (models.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="text-text-weaker">
            <th className="py-1 pr-3 font-normal">Case</th>
            {models.map((model) => (
              <th key={model} className="py-1 pr-3 font-normal">
                {shortModel(model)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((evalCase) => (
            <tr key={evalCase.id} className="border-t border-border-weaker-base">
              <td className="py-1 pr-3 text-text-base">{evalCase.title}</td>
              {models.map((model) => {
                const checks = props.results
                  .filter((result) => result.caseID === evalCase.id && result.config.buddyModel === model)
                  .flatMap((result) => result.checks)
                const passes = checks.filter((check) => check.status === "pass").length
                return (
                  <td key={model} className="py-1 pr-3 text-text-weak">
                    {checks.length > 0 ? `${passes}/${checks.length}` : "–"}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DevToolsEvalsTab() {
  const driver = useEvalDriverStore((state) => state.driver)
  const providers = useChatStore((state) =>
    driver ? (state.directories[driver.directory]?.providers ?? EMPTY_PROVIDERS) : EMPTY_PROVIDERS,
  )
  const running = useEvalRunStore((state) => state.running)
  const active = useEvalRunStore((state) => state.active)
  const progress = useEvalRunStore((state) => state.progress)
  const phaseStartedAt = useEvalRunStore((state) => state.phaseStartedAt)
  const results = useEvalRunStore((state) => state.results)
  const runDirectory = useEvalRunStore((state) => state.directory)
  const [selectedBuddyModels, setSelectedBuddyModels] = useState<string[]>([])
  const [effort, setEffort] = useState(DEFAULT_EFFORT)
  const [selectedLearnerModel, setSelectedLearnerModel] = useState<string | undefined>(undefined)
  const [repeats, setRepeats] = useState(REPEAT_OPTIONS[0] ?? "1")
  const [selectedCaseIDs, setSelectedCaseIDs] = useState<string[]>(() =>
    TEACHING_EVAL_CASES.map((evalCase) => evalCase.id),
  )
  const [isCopied, setIsCopied] = useState(false)
  const now = useNow(running)

  const modelOptions = useMemo(() => buildModelOptions(providers), [providers])
  const modelKeys = new Set(modelOptions.map((option) => option.key))
  const defaultModel =
    modelOptions.find((option) => FREE_MODEL_GROUP_PATTERN.test(option.group))?.key ?? modelOptions[0]?.key
  const validBuddyModels = selectedBuddyModels.filter((key) => modelKeys.has(key))
  const buddyModels = validBuddyModels.length > 0 ? validBuddyModels : defaultModel ? [defaultModel] : []
  const learnerModel =
    selectedLearnerModel && modelKeys.has(selectedLearnerModel) ? selectedLearnerModel : defaultModel
  const effortOptions = [
    DEFAULT_EFFORT,
    ...new Set(
      modelOptions.filter((option) => buddyModels.includes(option.key)).flatMap((option) => option.variants),
    ),
  ]
  const selectedEffort = effortOptions.includes(effort) ? effort : DEFAULT_EFFORT
  const selectedCases = TEACHING_EVAL_CASES.filter((evalCase) => selectedCaseIDs.includes(evalCase.id))
  const repeatCount = Number(repeats)
  const queueSize = buddyModels.length * selectedCases.length * repeatCount
  const canRun = Boolean(driver && learnerModel && queueSize > 0 && !running)
  const passCount = results.flatMap((result) => result.checks).filter((check) => check.status === "pass").length
  const checkCount = results.flatMap((result) => result.checks).length

  function toggleBuddyModel(key: string, checked: boolean) {
    setSelectedBuddyModels(() => {
      const current = buddyModels
      return checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)
    })
  }

  function toggleCase(caseID: string, checked: boolean) {
    setSelectedCaseIDs((current) => (checked ? [...current, caseID] : current.filter((id) => id !== caseID)))
  }

  function handleRun() {
    if (!driver || !learnerModel) return
    const queue = buildEvalQueue({
      cases: selectedCases,
      buddyModels,
      effort: selectedEffort,
      learnerModel,
      repeats: repeatCount,
    })
    void startEvalRun({ queue, directory: driver.directory })
  }

  async function handleCopyResults() {
    await copyToClipboard(JSON.stringify(results, null, 2))
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), COPY_FEEDBACK_DURATION_MS)
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-text-base">Teaching evals</p>
        <p className="text-[11px] text-text-weaker">
          Each conversation starts a new chat in the open notebook with the Bench cleared, and sends its turns
          through the real composer. Scripted cases send fixed messages; learner cases let a simulated learner
          write each next message and answer any question Buddy asks. Keep the chat in view while it runs. For
          parallel runs, open another window (File → New Window) on a different notebook and run there.
        </p>
        <p className="text-[11px] text-text-weak">
          Notebook: {driver?.directory ?? "Open a notebook chat to run evals."}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-text-weak">Buddy models ({buddyModels.length} selected)</p>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border-weaker-base p-2">
          {groupModelOptions(modelOptions).map(([group, options]) => (
            <div key={group} className="space-y-1">
              <p className="text-[11px] text-text-weaker">{group}</p>
              {options.map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-xs text-text-base">
                  <Checkbox
                    checked={buddyModels.includes(option.key)}
                    disabled={running}
                    onCheckedChange={(checked) => toggleBuddyModel(option.key, checked === true)}
                    aria-label={option.label}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label htmlFor={EFFORT_SELECT_ID} className="text-xs font-medium text-text-weak">
            Effort
          </label>
          <Select value={selectedEffort} onValueChange={setEffort} disabled={running}>
            <SelectTrigger id={EFFORT_SELECT_ID} size="sm" className="min-w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
              {effortOptions.map((option) => (
                <SelectItem key={option} value={option} className="text-xs">
                  {option === DEFAULT_EFFORT ? "Default" : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor={LEARNER_MODEL_SELECT_ID} className="text-xs font-medium text-text-weak">
            Learner model
          </label>
          <Select value={learnerModel ?? ""} onValueChange={setSelectedLearnerModel} disabled={running}>
            <SelectTrigger id={LEARNER_MODEL_SELECT_ID} size="sm" className="min-w-56 text-xs">
              <SelectValue placeholder="No models available" />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
              {groupModelOptions(modelOptions).map(([group, options]) => (
                <SelectGroup key={group}>
                  <SelectLabel className="text-[11px]">{group}</SelectLabel>
                  {options.map((option) => (
                    <SelectItem key={option.key} value={option.key} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor={REPEATS_SELECT_ID} className="text-xs font-medium text-text-weak">
            Runs per case
          </label>
          <Select value={repeats} onValueChange={setRepeats} disabled={running}>
            <SelectTrigger id={REPEATS_SELECT_ID} size="sm" className="min-w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }} position="popper">
              {REPEAT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-text-weak">Cases</p>
        {TEACHING_EVAL_CASES.map((evalCase) => (
          <label key={evalCase.id} className="flex items-start gap-2 text-xs text-text-base">
            <Checkbox
              checked={selectedCaseIDs.includes(evalCase.id)}
              disabled={running}
              onCheckedChange={(checked) => toggleCase(evalCase.id, checked === true)}
              aria-label={evalCase.title}
            />
            <span>
              {evalCase.title}
              <span className="text-text-weaker">
                {" "}
                ·{" "}
                {evalCase.kind === "scripted"
                  ? `script, ${evalCase.turns.length} ${evalCase.turns.length === 1 ? "turn" : "turns"}`
                  : `simulated learner, up to ${evalCase.maxTurns} turns`}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={stopEvalRun}>
            Stop
          </Button>
        ) : (
          <Button type="button" size="sm" className="h-7 text-[11px]" disabled={!canRun} onClick={handleRun}>
            Run {queueSize} {queueSize === 1 ? "conversation" : "conversations"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          disabled={results.length === 0}
          onClick={() => {
            void handleCopyResults()
          }}
        >
          {isCopied ? <CheckIcon className="size-3.5 text-text-success-base" /> : <CopyIcon className="size-3.5" />}
          Copy results
        </Button>
        {checkCount > 0 ? (
          <span className="text-[11px] text-text-weak">
            {passCount} of {checkCount} checks pass
          </span>
        ) : null}
      </div>

      {running && active ? (
        <p className="text-[11px] text-text-weak">
          {active.position} of {active.total} · {shortModel(active.config.buddyModel)} · {active.caseTitle} · run{" "}
          {active.repeat}
          {progress ? ` · turn ${progress.turnIndex + 1} · ${PHASE_LABELS[progress.phase]}` : ""}
          {phaseStartedAt ? ` (${formatElapsed(now - phaseStartedAt)})` : ""}
        </p>
      ) : null}
      {running && driver && runDirectory && driver.directory !== runDirectory ? (
        <p className="text-[11px] text-icon-critical-base">Return to {runDirectory} to keep the run going.</p>
      ) : null}

      <SummaryGrid results={results} />

      <div className="space-y-2">
        {results.map((result) => (
          <ResultCard key={`${result.caseID}-${result.config.buddyModel}-${result.repeat}-${result.startedAt}`} result={result} />
        ))}
      </div>
    </div>
  )
}
