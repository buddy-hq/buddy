import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { parseConfiguredModel } from "@/lib/directory-chat/chat-prompt-helpers"
import type { EvalMessage } from "./teaching-evals"

const EVAL_LEARNER_AGENT = "eval-learner"
const EVAL_LEARNER_SESSION_TITLE = "Eval learner"
const LEARNER_POLL_INTERVAL_MS = 1_000
const LEARNER_TIMEOUT_MS = 3 * 60_000

export const LEARNER_DONE = "DONE"

export type EvalQuestionRequest = {
  id: string
  sessionID: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
  }>
}

function learnerAbortedError() {
  return new Error("Eval run stopped.")
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(learnerAbortedError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(learnerAbortedError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function completedLearnerReply(messages: EvalMessage[]) {
  const assistant = messages.findLast((message) => message.info.role === "assistant")
  if (!assistant || assistant.info.role !== "assistant") return undefined
  if (assistant.info.error) {
    throw new Error(`The learner model failed: ${assistant.info.error.name}`)
  }
  if (!assistant.info.time.completed) return undefined
  return assistant.parts
    .flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : []))
    .join("\n")
    .trim()
}

export async function askLearner(input: {
  directory: string
  model: string
  request: string
  signal: AbortSignal
}): Promise<string> {
  const model = parseConfiguredModel(input.model)
  if (!model) throw new Error(`Unknown learner model: ${input.model}`)
  const client = getBuddyClient(input.directory)
  const session = requireBuddyData(
    await client.session.create({
      directory: input.directory,
      body: { title: EVAL_LEARNER_SESSION_TITLE },
    }),
  )
  try {
    const sent = await client.session.promptAsync({
      sessionID: session.id,
      directory: input.directory,
      body: { content: input.request, agent: EVAL_LEARNER_AGENT, model },
    })
    if (!sent.response?.ok) throw new Error("The learner prompt was rejected.")
    const deadline = Date.now() + LEARNER_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(LEARNER_POLL_INTERVAL_MS, input.signal)
      const messages = requireBuddyData(
        await client.session.messages({ sessionID: session.id, directory: input.directory }),
      )
      const reply = completedLearnerReply(messages)
      if (reply !== undefined) return reply
    }
    throw new Error("Timed out waiting for the learner.")
  } finally {
    await client.session
      .update({ sessionID: session.id, directory: input.directory, time: { archived: Date.now() } })
      .catch(() => undefined)
  }
}

export function buildNextMessageRequest(input: { profile: string; transcript: string }) {
  return [
    "Learner profile:",
    input.profile,
    "",
    "Conversation so far:",
    input.transcript,
    "",
    `Write the learner's next message to the tutor, or ${LEARNER_DONE} if the learner would stop here.`,
  ].join("\n")
}

export function buildQuestionAnswerRequest(input: {
  profile: string
  transcript: string
  request: EvalQuestionRequest
}) {
  const questions = input.request.questions.map((item, index) => {
    const options = item.options.map((option) => `   - ${option.label}: ${option.description}`)
    return [`${index + 1}. ${item.question}`, ...options].join("\n")
  })
  return [
    "Learner profile:",
    input.profile,
    "",
    "Conversation so far:",
    input.transcript || "(the tutor is replying to the learner's first message)",
    "",
    "The tutor paused to ask the learner these questions:",
    ...questions,
    "",
    "Answer as the learner. Write one line per question, in order: the exact label of the option the learner would choose, or the learner's own short answer.",
  ].join("\n")
}

export function parseQuestionAnswers(request: EvalQuestionRequest, reply: string): string[][] {
  const lines = reply
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
  return request.questions.map((item, index) => {
    const line = lines[index] ?? lines.at(-1) ?? ""
    const option = item.options.find((candidate) => candidate.label.toLowerCase() === line.toLowerCase())
    return [option ? option.label : line]
  })
}
