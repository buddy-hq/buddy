import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { useChatStore } from "@/state/chat-store"
import { isSessionWorking } from "@/state/session-status"
import { getEvalDriver, type EvalDriver } from "./eval-driver-store"
import {
  askLearner,
  buildNextMessageRequest,
  buildQuestionAnswerRequest,
  LEARNER_DONE,
  parseQuestionAnswers,
  type EvalQuestionRequest,
} from "./simulated-learner"
import {
  formatLearnerTranscript,
  NEUTRAL_LEARNER_PROFILE,
  scoreEvalCase,
  summarizeEvalTurns,
  type EvalCase,
  type EvalCheckResult,
  type EvalMessage,
  type EvalRunOutcome,
  type EvalTurnRecord,
} from "./teaching-evals"

const POLL_INTERVAL_MS = 500
const QUESTION_POLL_INTERVAL_MS = 2_000
const IDLE_SETTLE_MS = 2_000
const DRAFT_READY_TIMEOUT_MS = 10_000
const SESSION_CREATED_TIMEOUT_MS = 30_000
const TURN_TIMEOUT_MS = 8 * 60_000

export type EvalRunConfig = {
  buddyModel: string
  effort: string
  learnerModel: string
}

export type EvalRunProgress = {
  caseID: string
  turnIndex: number
  phase: "starting" | "sending" | "waiting" | "answering" | "learner" | "reading"
}

export type EvalCaseResult = {
  caseID: string
  title: string
  kind: EvalCase["kind"]
  config: EvalRunConfig
  repeat: number
  directory: string
  sessionID: string | undefined
  startedAt: number
  finishedAt: number
  turns: EvalTurnRecord[]
  outcome: EvalRunOutcome
  checks: EvalCheckResult[]
  error: string | undefined
}

function stoppedError() {
  return new Error("Eval run stopped.")
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(stoppedError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(stoppedError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function waitFor<TValue>(input: {
  read: () => TValue | undefined
  timeoutMs: number
  description: string
  signal: AbortSignal
}): Promise<TValue> {
  const deadline = Date.now() + input.timeoutMs
  while (Date.now() < deadline) {
    const value = input.read()
    if (value !== undefined) return value
    await sleep(POLL_INTERVAL_MS, input.signal)
  }
  throw new Error(`Timed out waiting for ${input.description}.`)
}

function requireDriver(directory: string): EvalDriver {
  const driver = getEvalDriver()
  if (!driver || driver.directory !== directory) {
    throw new Error("The chat for this notebook is no longer open. Keep the eval notebook in view.")
  }
  return driver
}

function currentSessionID(directory: string) {
  return useChatStore.getState().directories[directory]?.sessionID
}

function isBusy(directory: string, sessionID: string) {
  const state = useChatStore.getState().directories[directory]
  if (!state) return false
  return isSessionWorking({
    info: state.sessions.find((session) => session.id === sessionID),
    status: state.sessionStatusByID[sessionID],
  })
}

async function readSessionMessages(directory: string, sessionID: string): Promise<EvalMessage[]> {
  const result = await getBuddyClient(directory).session.messages({ sessionID, directory })
  return requireBuddyData(result)
}

async function pendingQuestionsFor(directory: string, sessionID: string): Promise<EvalQuestionRequest[]> {
  const requests = requireBuddyData(await getBuddyClient(directory).question.list({ directory }))
  return requests.filter((request) => request.sessionID === sessionID)
}

function learnerProfile(evalCase: EvalCase) {
  return evalCase.kind === "simulated" ? evalCase.profile : NEUTRAL_LEARNER_PROFILE
}

export async function runTeachingEvalCase(input: {
  evalCase: EvalCase
  config: EvalRunConfig
  repeat: number
  directory: string
  signal: AbortSignal
  onProgress: (progress: EvalRunProgress) => void
}): Promise<EvalCaseResult> {
  const { evalCase, config, directory, signal } = input
  const startedAt = Date.now()
  const outcome: EvalRunOutcome = { learnerDone: false, questionAnswers: [] }
  const answeredQuestionIDs = new Set<string>()
  let sessionID: string | undefined
  const progress = (turnIndex: number, phase: EvalRunProgress["phase"]) =>
    input.onProgress({ caseID: evalCase.id, turnIndex, phase })

  const readTurns = async () =>
    sessionID ? summarizeEvalTurns(await readSessionMessages(directory, sessionID)) : []

  const answerPendingQuestions = async (activeSessionID: string, turnIndex: number) => {
    const pending = await pendingQuestionsFor(directory, activeSessionID)
    for (const request of pending) {
      if (answeredQuestionIDs.has(request.id)) continue
      answeredQuestionIDs.add(request.id)
      progress(turnIndex, "answering")
      const turns = await readTurns()
      const reply = await askLearner({
        directory,
        model: config.learnerModel,
        request: buildQuestionAnswerRequest({
          profile: learnerProfile(evalCase),
          transcript: formatLearnerTranscript(turns, outcome),
          request,
        }),
        signal,
      })
      const answers = parseQuestionAnswers(request, reply)
      requireBuddyData(
        await getBuddyClient(directory).question.reply({ requestID: request.id, directory, answers }),
      )
      request.questions.forEach((item, index) => {
        outcome.questionAnswers.push({
          turnIndex,
          question: item.question,
          answer: answers[index]?.join(", ") ?? "",
        })
      })
      progress(turnIndex, "waiting")
    }
  }

  const waitForTurnToFinish = async (activeSessionID: string, turnIndex: number) => {
    const deadline = Date.now() + TURN_TIMEOUT_MS
    let idleSince: number | undefined
    let lastQuestionPoll = 0
    while (Date.now() < deadline) {
      if (isBusy(directory, activeSessionID)) {
        idleSince = undefined
        if (Date.now() - lastQuestionPoll >= QUESTION_POLL_INTERVAL_MS) {
          lastQuestionPoll = Date.now()
          await answerPendingQuestions(activeSessionID, turnIndex)
        }
      } else {
        idleSince ??= Date.now()
        if (Date.now() - idleSince >= IDLE_SETTLE_MS) return
      }
      await sleep(POLL_INTERVAL_MS, signal)
    }
    throw new Error("Timed out waiting for Buddy to finish the turn.")
  }

  const nextLearnerMessage = async (turnIndex: number) => {
    if (evalCase.kind === "scripted") return evalCase.turns[turnIndex]
    if (turnIndex === 0) return evalCase.opening
    if (turnIndex >= evalCase.maxTurns) return undefined
    progress(turnIndex, "learner")
    const reply = await askLearner({
      directory,
      model: config.learnerModel,
      request: buildNextMessageRequest({
        profile: evalCase.profile,
        transcript: formatLearnerTranscript(await readTurns(), outcome),
      }),
      signal,
    })
    if (reply.trim() === LEARNER_DONE) {
      outcome.learnerDone = true
      return undefined
    }
    return reply
  }

  const finish = async (error: string | undefined): Promise<EvalCaseResult> => {
    const turns = await readTurns().catch(() => [])
    return {
      caseID: evalCase.id,
      title: evalCase.title,
      kind: evalCase.kind,
      config,
      repeat: input.repeat,
      directory,
      sessionID,
      startedAt,
      finishedAt: Date.now(),
      turns,
      outcome,
      checks: error ? [] : scoreEvalCase(evalCase, turns, outcome),
      error,
    }
  }

  try {
    progress(0, "starting")
    await requireDriver(directory).resetBench()
    requireDriver(directory).selectModel(config.buddyModel)
    await requireDriver(directory).startChat()
    await waitFor({
      read: () => (currentSessionID(directory) === undefined ? true : undefined),
      timeoutMs: DRAFT_READY_TIMEOUT_MS,
      description: "a new chat",
      signal,
    })
    await sleep(POLL_INTERVAL_MS, signal)
    requireDriver(directory).selectModel(config.buddyModel)
    await sleep(POLL_INTERVAL_MS, signal)
    requireDriver(directory).selectThinking(config.effort)
    await sleep(POLL_INTERVAL_MS, signal)

    for (let turnIndex = 0; ; turnIndex += 1) {
      const text = await nextLearnerMessage(turnIndex)
      if (text === undefined) break
      progress(turnIndex, "sending")
      await requireDriver(directory).send(text)
      const activeSessionID = await waitFor({
        read: () => currentSessionID(directory),
        timeoutMs: SESSION_CREATED_TIMEOUT_MS,
        description: "the chat to start",
        signal,
      })
      sessionID = activeSessionID
      progress(turnIndex, "waiting")
      await waitForTurnToFinish(activeSessionID, turnIndex)
    }

    progress(0, "reading")
    return await finish(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return await finish(message)
  }
}
