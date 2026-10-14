import { create } from "zustand"
import { abortPrompt } from "@/state/chat-actions"
import {
  runTeachingEvalCase,
  type EvalCaseResult,
  type EvalRunConfig,
  type EvalRunProgress,
} from "./run-teaching-eval"
import type { EvalCase } from "./teaching-evals"

export type EvalQueueItem = {
  evalCase: EvalCase
  config: EvalRunConfig
  repeat: number
}

export type EvalActiveItem = {
  caseTitle: string
  config: EvalRunConfig
  repeat: number
  position: number
  total: number
}

type EvalRunState = {
  running: boolean
  directory: string | undefined
  active: EvalActiveItem | undefined
  progress: EvalRunProgress | undefined
  phaseStartedAt: number | undefined
  results: EvalCaseResult[]
  controller: AbortController | undefined
}

export const useEvalRunStore = create<EvalRunState>(() => ({
  running: false,
  directory: undefined,
  active: undefined,
  progress: undefined,
  phaseStartedAt: undefined,
  results: [],
  controller: undefined,
}))

function sameProgress(left: EvalRunProgress | undefined, right: EvalRunProgress) {
  return (
    left?.caseID === right.caseID && left.turnIndex === right.turnIndex && left.phase === right.phase
  )
}

export function buildEvalQueue(input: {
  cases: EvalCase[]
  buddyModels: string[]
  effort: string
  learnerModel: string
  repeats: number
}): EvalQueueItem[] {
  return input.buddyModels.flatMap((buddyModel) =>
    input.cases.flatMap((evalCase) =>
      Array.from({ length: input.repeats }, (_, index) => ({
        evalCase,
        config: { buddyModel, effort: input.effort, learnerModel: input.learnerModel },
        repeat: index + 1,
      })),
    ),
  )
}

export async function startEvalRun(input: { queue: EvalQueueItem[]; directory: string }) {
  if (useEvalRunStore.getState().running) return
  const controller = new AbortController()
  useEvalRunStore.setState({
    running: true,
    directory: input.directory,
    active: undefined,
    progress: undefined,
    phaseStartedAt: undefined,
    results: [],
    controller,
  })
  try {
    for (const [index, item] of input.queue.entries()) {
      if (controller.signal.aborted) break
      useEvalRunStore.setState({
        active: {
          caseTitle: item.evalCase.title,
          config: item.config,
          repeat: item.repeat,
          position: index + 1,
          total: input.queue.length,
        },
      })
      const result = await runTeachingEvalCase({
        evalCase: item.evalCase,
        config: item.config,
        repeat: item.repeat,
        directory: input.directory,
        signal: controller.signal,
        onProgress: (progress) => {
          if (sameProgress(useEvalRunStore.getState().progress, progress)) return
          useEvalRunStore.setState({ progress, phaseStartedAt: Date.now() })
        },
      })
      useEvalRunStore.setState((state) => ({ results: [...state.results, result] }))
    }
  } finally {
    useEvalRunStore.setState({
      running: false,
      active: undefined,
      progress: undefined,
      phaseStartedAt: undefined,
      controller: undefined,
    })
  }
}

export function stopEvalRun() {
  const state = useEvalRunStore.getState()
  if (!state.running) return
  state.controller?.abort()
  if (state.directory) void abortPrompt(state.directory).catch(() => undefined)
}
