import type { Message, Part } from "@buddy/sdk"
import { parseBuddyConfigObject, parseStringValue } from "@/state/parse-external"

export type EvalMessage = {
  info: Message
  parts: Part[]
}

export type EvalTurnRecord = {
  id: string
  prompt: string
  tools: string[]
  skills: string[]
  visuals: string[]
  shown: string[]
  reply: string
  fullReply: string
  endsWithQuestion: boolean
  benchSeen: string
  model: string | undefined
  variant: string | undefined
  error: string | undefined
}

export type EvalQuestionAnswer = {
  turnIndex: number
  question: string
  answer: string
}

export type EvalRunOutcome = {
  learnerDone: boolean
  questionAnswers: EvalQuestionAnswer[]
}

export type EvalCheckStatus = "pass" | "fail" | "review"

export type EvalCheckResult = {
  label: string
  status: EvalCheckStatus
  detail: string
}

export type EvalCheck = {
  label: string
  run: (turns: EvalTurnRecord[], outcome: EvalRunOutcome) => Omit<EvalCheckResult, "label">
}

export type ScriptedEvalCase = {
  kind: "scripted"
  id: string
  title: string
  turns: string[]
  checks: EvalCheck[]
}

export type SimulatedEvalCase = {
  kind: "simulated"
  id: string
  title: string
  profile: string
  opening: string
  maxTurns: number
  checks: EvalCheck[]
}

export type EvalCase = ScriptedEvalCase | SimulatedEvalCase

export const NEUTRAL_LEARNER_PROFILE =
  "A curious beginner who wants to understand the topic they asked about. Cooperative, answers questions briefly and honestly, and says so when something is unclear."

const VISUAL_TOOL_DESCRIPTIONS = new Map([
  ["whiteboard_create_view", "drew on the whiteboard"],
  ["render_mermaid", "showed a diagram"],
  ["render_figure", "showed a figure"],
  ["render_freeform_figure", "showed a figure"],
  ["render_svg", "showed a figure"],
  ["present_html_widget", "opened an interactive page"],
  ["present_media", "showed an image or video"],
  ["imagegen", "showed a generated image"],
  ["inapp_browser_open", "opened a web page"],
  ["bench_present", "put something on the Bench"],
])

const WHITEBOARD_TOOLS = new Set(["whiteboard_create_view", "whiteboard_read_context"])
const WHITEBOARD_CREATE_TOOL = "whiteboard_create_view"
const INTERACTIVE_TOOLS = new Set(["present_html_widget", "inapp_browser_open"])
const BENCH_CONTEXT_OPEN_TAG = "<bench_turn_context>"
const BENCH_CONTEXT_CLOSE_TAG = "</bench_turn_context>"
const BENCH_CONTEXT_REFERENCE = "<bench_ctx_ref"
const BENCH_LOADED_PATTERN = /The learner has Bench loaded with ([^\n.]+)/
const BENCH_TITLE_PATTERN = /^Title: (.+)$/m
const QUIZ_COMPLAINT_PATTERN = /stop (asking|quizzing)|just (tell|explain)|why (are you|do you keep) ask|too many questions|annoying/i

function isToolPart(part: Part): part is Extract<Part, { type: "tool" }> {
  return part.type === "tool"
}

function isTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text"
}

function skillName(part: Extract<Part, { type: "tool" }>) {
  return parseStringValue(part.state.input["name"])
}

function describeVisual(part: Extract<Part, { type: "tool" }>) {
  const description = VISUAL_TOOL_DESCRIPTIONS.get(part.tool)
  if (!description) return undefined
  const title = part.state.status === "completed" ? part.state.title.trim() : ""
  return title ? `${description}: "${title}"` : description
}

export function summarizeBenchContext(parts: Part[]) {
  const texts = parts.filter(isTextPart).map((part) => part.text)
  const benchText = texts.find((text) => text.includes(BENCH_CONTEXT_OPEN_TAG))
  if (!benchText) {
    if (texts.some((text) => text.includes(BENCH_CONTEXT_REFERENCE))) return "unchanged"
    return "none"
  }
  const start = benchText.indexOf(BENCH_CONTEXT_OPEN_TAG) + BENCH_CONTEXT_OPEN_TAG.length
  const end = benchText.indexOf(BENCH_CONTEXT_CLOSE_TAG, start)
  const body = benchText.slice(start, end === -1 ? undefined : end).trim()
  const loaded = BENCH_LOADED_PATTERN.exec(body)?.[1]?.trim()
  const title = BENCH_TITLE_PATTERN.exec(body)?.[1]?.trim()
  if (loaded && title) return `${loaded} · ${title}`
  if (loaded) return loaded
  return body.split("\n")[0]?.trim() || "none"
}

export function summarizeEvalTurns(messages: EvalMessage[]): EvalTurnRecord[] {
  const turns: EvalTurnRecord[] = []
  for (const message of messages) {
    if (message.info.role === "user") {
      const prompt = message.parts
        .filter(isTextPart)
        .filter((part) => !part.synthetic)
        .map((part) => part.text)
        .join("\n")
        .trim()
      turns.push({
        id: message.info.id,
        prompt,
        tools: [],
        skills: [],
        visuals: [],
        shown: [],
        reply: "",
        fullReply: "",
        endsWithQuestion: false,
        benchSeen: summarizeBenchContext(message.parts),
        model: undefined,
        variant: message.info.model.variant ?? undefined,
        error: undefined,
      })
      continue
    }
    const turn = turns.at(-1)
    if (!turn) continue
    turn.model = `${message.info.providerID}/${message.info.modelID}`
    if (message.info.error) {
      const detail = parseStringValue(parseBuddyConfigObject(message.info.error.data)?.["message"])
      turn.error = detail ? `${message.info.error.name}: ${detail}` : message.info.error.name
    }
    for (const part of message.parts) {
      if (isToolPart(part)) {
        turn.tools.push(part.tool)
        if (part.tool === "skill") {
          const name = skillName(part)
          if (name) turn.skills.push(name)
        }
        const shown = describeVisual(part)
        if (shown) {
          turn.visuals.push(part.tool)
          turn.shown.push(shown)
        }
        continue
      }
      if (isTextPart(part) && !part.synthetic && part.text.trim()) {
        turn.reply = part.text.trim()
        turn.fullReply = turn.fullReply ? `${turn.fullReply}\n\n${turn.reply}` : turn.reply
      }
    }
    turn.endsWithQuestion = turn.reply.endsWith("?")
  }
  return turns
}

export function scoreEvalCase(
  evalCase: EvalCase,
  turns: EvalTurnRecord[],
  outcome: EvalRunOutcome,
): EvalCheckResult[] {
  return evalCase.checks.map((check) => ({ label: check.label, ...check.run(turns, outcome) }))
}

export function formatLearnerTranscript(turns: EvalTurnRecord[], outcome: EvalRunOutcome) {
  return turns
    .map((turn, index) => {
      const lines = [`Learner: ${turn.prompt}`]
      for (const answer of outcome.questionAnswers.filter((item) => item.turnIndex === index)) {
        lines.push(`Tutor asked: ${answer.question}`, `Learner answered: ${answer.answer}`)
      }
      if (turn.shown.length > 0) lines.push(`[On screen, the tutor ${turn.shown.join("; ")}]`)
      lines.push(`Tutor: ${turn.fullReply || "(no reply)"}`)
      return lines.join("\n")
    })
    .join("\n\n")
}

function turnLabel(index: number) {
  return `turn ${index + 1}`
}

function firstTurnMatching(
  turns: EvalTurnRecord[],
  limit: number,
  match: (turn: EvalTurnRecord) => boolean,
) {
  const index = turns.slice(0, limit).findIndex(match)
  return index === -1 ? undefined : index
}

function showsStructureBy(limit: number): EvalCheck["run"] {
  return (turns) => {
    const index = firstTurnMatching(turns, limit, (turn) => turn.visuals.length > 0)
    if (index === undefined) {
      return { status: "fail", detail: `No visual in the first ${limit} turn(s).` }
    }
    return { status: "pass", detail: `${turnLabel(index)}: ${turns[index]?.shown.join("; ")}` }
  }
}

function usesWhiteboardBy(limit: number): EvalCheck["run"] {
  return (turns) => {
    const index = firstTurnMatching(turns, limit, (turn) =>
      turn.tools.includes(WHITEBOARD_CREATE_TOOL),
    )
    if (index === undefined) {
      return { status: "fail", detail: `No whiteboard in the first ${limit} turn(s).` }
    }
    return { status: "pass", detail: `Whiteboard on ${turnLabel(index)}.` }
  }
}

function extendsWhiteboard(): EvalCheck["run"] {
  return (turns) => {
    const boardTurns = turns.filter((turn) => turn.tools.some((tool) => WHITEBOARD_TOOLS.has(tool)))
    if (boardTurns.length >= 2) {
      return { status: "pass", detail: `Board used on ${boardTurns.length} turns.` }
    }
    if (boardTurns.length === 1) return { status: "fail", detail: "Board used once, never extended." }
    return { status: "fail", detail: "No board." }
  }
}

function finishesWithoutQuestion(turnIndexes: number[]): EvalCheck["run"] {
  return (turns) => {
    const asking = turnIndexes.filter((index) => turns[index]?.endsWithQuestion)
    if (asking.length === 0) return { status: "pass", detail: "No trailing question." }
    return {
      status: "fail",
      detail: `Ends with a question on ${asking.map(turnLabel).join(", ")}.`,
    }
  }
}

function questionEndingsAtMost(maxShare: number): EvalCheck["run"] {
  return (turns) => {
    const asking = turns.filter((turn) => turn.endsWithQuestion).length
    const detail = `${asking} of ${turns.length} turns end with a question.`
    if (turns.length === 0) return { status: "fail", detail: "No turns." }
    return { status: asking / turns.length <= maxShare ? "pass" : "fail", detail }
  }
}

function learnerNeverComplainsAboutQuestions(): EvalCheck["run"] {
  return (turns) => {
    const index = turns.findIndex((turn, position) => position > 0 && QUIZ_COMPLAINT_PATTERN.test(turn.prompt))
    if (index === -1) return { status: "pass", detail: "No complaints about being quizzed." }
    return { status: "fail", detail: `${turnLabel(index)}: "${turns[index]?.prompt}"` }
  }
}

function noVisuals(): EvalCheck["run"] {
  return (turns) => {
    const visuals = turns.flatMap((turn) => turn.visuals)
    if (visuals.length === 0) return { status: "pass", detail: "Words only." }
    return { status: "fail", detail: `Showed ${visuals.join(", ")}.` }
  }
}

function interactiveOnTurn(index: number): EvalCheck["run"] {
  return (turns) => {
    const turn = turns[index]
    const tool = turn?.tools.find((name) => INTERACTIVE_TOOLS.has(name))
    if (!tool) return { status: "fail", detail: `No interactive page on ${turnLabel(index)}.` }
    return {
      status: "review",
      detail: `${tool} on ${turnLabel(index)}. Check that the learner can change something that matters.`,
    }
  }
}

function learnerReachedGoal(): EvalCheck["run"] {
  return (turns, outcome) => {
    const last = turns.at(-1)?.prompt ?? ""
    if (outcome.learnerDone) return { status: "pass", detail: `Learner finished after ${turns.length} turns.` }
    return { status: "review", detail: `Stopped at the turn limit. Last learner message: "${last}"` }
  }
}

function misconceptionConfronted(): EvalCheck["run"] {
  return (turns) => {
    const index = firstTurnMatching(turns, 3, (turn) => turn.visuals.length > 0)
    const shown = index === undefined ? "nothing shown in the first 3 turns" : `${turnLabel(index)}: ${turns[index]?.shown.join("; ")}`
    return {
      status: "review",
      detail: `Check that Buddy made the wrong idea fail visibly before correcting it (${shown}).`,
    }
  }
}

export const TEACHING_EVAL_CASES: EvalCase[] = [
  {
    kind: "scripted",
    id: "neural-networks-replay",
    title: "Neural networks replay",
    turns: [
      "help me understand neural netwroks",
      "sure",
      "hwo to bild one",
      "help me undsrantd architectuer",
      "i can't imagine it",
      "can you make this interactive",
    ],
    checks: [
      { label: "Shows the structure before being asked", run: showsStructureBy(4) },
      { label: "Builds it on the whiteboard", run: usesWhiteboardBy(4) },
      { label: "Teaching turns finish without a question", run: finishesWithoutQuestion([0, 3]) },
      { label: "Interactive page on request", run: interactiveOnTurn(5) },
    ],
  },
  {
    kind: "scripted",
    id: "water-cycle",
    title: "Water cycle before a test",
    turns: ["Help me understand the water cycle — I have a test tomorrow."],
    checks: [
      { label: "Shows the process", run: showsStructureBy(1) },
      { label: "Finishes without a question", run: finishesWithoutQuestion([0]) },
    ],
  },
  {
    kind: "scripted",
    id: "small-talk",
    title: "Small talk stays in words",
    turns: ["hey, how's it going?"],
    checks: [{ label: "No visual for small talk", run: noVisuals() }],
  },
  {
    kind: "simulated",
    id: "lost-beginner",
    title: "Lost beginner · neural networks",
    profile:
      "A beginner with no machine-learning background who wants to understand how neural networks work. Types casually with typos. Gets lost quickly when an explanation stays abstract or is all words, and says so plainly, for example \"i can't picture it\". Once the idea makes sense, wants to know how to build a small one. Finishes once they could explain the basic structure to a friend.",
    opening: "help me understand neural netwroks",
    maxTurns: 6,
    checks: [
      { label: "Shows the structure on the first turn", run: showsStructureBy(1) },
      { label: "Builds it on the whiteboard", run: usesWhiteboardBy(2) },
      { label: "Extends the same board", run: extendsWhiteboard() },
      { label: "At most a third of turns end with a question", run: questionEndingsAtMost(1 / 3) },
      { label: "Learner reaches their goal", run: learnerReachedGoal() },
    ],
  },
  {
    kind: "simulated",
    id: "test-crammer",
    title: "Test crammer · water cycle",
    profile:
      "A high-school student with a biology test tomorrow on the water cycle. Wants the minimum needed to pass, is impatient with detours and long answers, and replies in a few words. Asks what is likely to be on the test. Finishes once they feel ready to answer a test question.",
    opening: "bio test tmrw on the water cycle. what do i need to know",
    maxTurns: 4,
    checks: [
      { label: "Shows the process on the first turn", run: showsStructureBy(1) },
      { label: "Doesn't quiz before explaining", run: finishesWithoutQuestion([0]) },
      { label: "Learner reaches their goal", run: learnerReachedGoal() },
    ],
  },
  {
    kind: "simulated",
    id: "stuck-misconception",
    title: "Stuck misconception · falling objects",
    profile:
      "A student who firmly believes heavier objects fall faster, because a rock obviously falls faster than a feather. Defends that belief against plain assertions and only changes their mind when shown something that makes the belief fail, such as a comparison, a thought experiment, or a demonstration. Finishes once they understand why the belief was wrong.",
    opening: "why do heavier things fall faster than light things?",
    maxTurns: 6,
    checks: [
      { label: "Makes the wrong idea fail visibly", run: misconceptionConfronted() },
      { label: "Learner reaches their goal", run: learnerReachedGoal() },
    ],
  },
  {
    kind: "simulated",
    id: "hates-questions",
    title: "Hates questions · dividing fractions",
    profile:
      "An adult relearning math who wants to understand why dividing by a fraction works, using 3/4 ÷ 1/2 as the example. Wants clear explanations and dislikes being quizzed; after one or two questions in a row, gets annoyed and says something like \"just explain it\". Finishes once the reason makes sense.",
    opening: "how does dividing fractions actually work? like 3/4 ÷ 1/2",
    maxTurns: 5,
    checks: [
      { label: "Shows the idea within two turns", run: showsStructureBy(2) },
      { label: "At most a third of turns end with a question", run: questionEndingsAtMost(1 / 3) },
      { label: "Learner never complains about being quizzed", run: learnerNeverComplainsAboutQuestions() },
      { label: "Learner reaches their goal", run: learnerReachedGoal() },
    ],
  },
]
