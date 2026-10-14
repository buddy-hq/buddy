import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@buddy/sdk"
import { buildEvalQueue } from "../src/lib/evals/eval-run-store"
import { parseQuestionAnswers, type EvalQuestionRequest } from "../src/lib/evals/simulated-learner"
import {
  TEACHING_EVAL_CASES,
  formatLearnerTranscript,
  scoreEvalCase,
  summarizeBenchContext,
  summarizeEvalTurns,
  type EvalMessage,
  type EvalRunOutcome,
} from "../src/lib/evals/teaching-evals"

const SESSION_ID = "ses_eval"
const EMPTY_OUTCOME: EvalRunOutcome = { learnerDone: false, questionAnswers: [] }

function userMessage(id: string, parts: Part[]): EvalMessage {
  const info: UserMessage = {
    id,
    sessionID: SESSION_ID,
    role: "user",
    time: { created: 1 },
    agent: "buddy",
    model: { providerID: "opencode", modelID: "big-pickle" },
  }
  return { info, parts }
}

function assistantMessage(id: string, parts: Part[], error?: AssistantMessage["error"]): EvalMessage {
  const info: AssistantMessage = {
    id,
    sessionID: SESSION_ID,
    role: "assistant",
    time: { created: 2, completed: 3 },
    error,
    parentID: "msg_parent",
    modelID: "big-pickle",
    providerID: "opencode",
    mode: "build",
    agent: "buddy",
    path: { cwd: "/notebook", root: "/notebook" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
  return { info, parts }
}

function textPart(id: string, text: string, synthetic = false): Part {
  return { id, sessionID: SESSION_ID, messageID: "msg", type: "text", text, synthetic }
}

function toolPart(id: string, tool: string, skillName?: string, title = tool): Part {
  return {
    id,
    sessionID: SESSION_ID,
    messageID: "msg",
    type: "tool",
    callID: `call_${id}`,
    tool,
    state: {
      status: "completed",
      input: skillName ? { name: skillName } : {},
      output: "",
      title,
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }
}

const BENCH_CONTEXT = [
  "<system-reminder>",
  "<bench_turn_context>",
  "The learner has Bench loaded with freeform-figure object.",
  "No right workspace drawer is open over the target.",
  "Title: A 2 → 4 → 1 network",
  "</bench_turn_context>",
  "</system-reminder>",
].join("\n")

describe("teaching evals", () => {
  test("summarizes what the model saw on the Bench", () => {
    expect(summarizeBenchContext([textPart("p1", BENCH_CONTEXT, true)])).toBe(
      "freeform-figure object · A 2 → 4 → 1 network",
    )
    expect(summarizeBenchContext([textPart("p1", '<bench_ctx_ref same="abc"/>', true)])).toBe("unchanged")
    expect(summarizeBenchContext([textPart("p1", "hello")])).toBe("none")
  })

  test("groups tools, skills, and the final reply by turn", () => {
    const turns = summarizeEvalTurns([
      userMessage("msg_u1", [textPart("p1", BENCH_CONTEXT, true), textPart("p2", "explain it")]),
      assistantMessage("msg_a1", [
        toolPart("t1", "skill", "teaching-models"),
        toolPart("t2", "whiteboard_create_view", undefined, "Network map"),
        textPart("p3", "Here is the idea."),
      ]),
      assistantMessage("msg_a2", [textPart("p4", "Want another example?")]),
      userMessage("msg_u2", [textPart("p5", "hey")]),
      assistantMessage("msg_a3", [], {
        name: "UnknownError",
        data: { message: "rate limited" },
      }),
    ])

    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      id: "msg_u1",
      prompt: "explain it",
      tools: ["skill", "whiteboard_create_view"],
      skills: ["teaching-models"],
      visuals: ["whiteboard_create_view"],
      shown: ['drew on the whiteboard: "Network map"'],
      reply: "Want another example?",
      fullReply: "Here is the idea.\n\nWant another example?",
      endsWithQuestion: true,
      benchSeen: "freeform-figure object · A 2 → 4 → 1 network",
      model: "opencode/big-pickle",
    })
    expect(turns[1]?.error).toBe("UnknownError: rate limited")
  })

  test("scores the neural-networks replay from its tool calls", () => {
    const replay = TEACHING_EVAL_CASES.find((evalCase) => evalCase.id === "neural-networks-replay")
    if (replay?.kind !== "scripted") throw new Error("missing replay case")
    const messages = replay.turns.flatMap((text, index) => [
      userMessage(`msg_u${index}`, [textPart(`pu${index}`, text)]),
      assistantMessage(`msg_a${index}`, [
        ...(index === 3 ? [toolPart(`tw${index}`, "whiteboard_create_view")] : []),
        ...(index === 5 ? [toolPart(`th${index}`, "present_html_widget")] : []),
        textPart(`pa${index}`, index === 0 ? "Want the numbers?" : "Done."),
      ]),
    ])

    const checks = scoreEvalCase(replay, summarizeEvalTurns(messages), EMPTY_OUTCOME)

    expect(checks.map((check) => check.status)).toEqual(["pass", "pass", "fail", "review"])
  })

  test("tells the learner what Buddy showed and what they answered", () => {
    const turns = summarizeEvalTurns([
      userMessage("msg_u1", [textPart("p1", "explain it")]),
      assistantMessage("msg_a1", [
        toolPart("t1", "whiteboard_create_view", undefined, "Network map"),
        textPart("p2", "Look at the board."),
      ]),
    ])
    const transcript = formatLearnerTranscript(turns, {
      learnerDone: false,
      questionAnswers: [{ turnIndex: 0, question: "Any background?", answer: "None" }],
    })

    expect(transcript).toBe(
      [
        "Learner: explain it",
        "Tutor asked: Any background?",
        "Learner answered: None",
        '[On screen, the tutor drew on the whiteboard: "Network map"]',
        "Tutor: Look at the board.",
      ].join("\n"),
    )
  })

  test("maps the learner's reply onto Buddy's question options", () => {
    const request: EvalQuestionRequest = {
      id: "que_1",
      sessionID: SESSION_ID,
      questions: [
        {
          question: "Where should we start?",
          header: "Start",
          options: [
            { label: "Big picture", description: "" },
            { label: "One neuron", description: "" },
          ],
        },
        { question: "What do you already know?", header: "Background", options: [] },
      ],
    }

    expect(parseQuestionAnswers(request, "1. big picture\n2. nothing really")).toEqual([
      ["Big picture"],
      ["nothing really"],
    ])
  })

  test("queues every model, case, and repeat", () => {
    const cases = TEACHING_EVAL_CASES.slice(0, 2)
    const queue = buildEvalQueue({
      cases,
      buddyModels: ["opencode/a", "opencode/b"],
      effort: "default",
      learnerModel: "opencode/a",
      repeats: 2,
    })

    expect(queue).toHaveLength(8)
    expect(queue.map((item) => `${item.config.buddyModel}:${item.evalCase.id}:${item.repeat}`).slice(0, 3)).toEqual([
      `opencode/a:${cases[0]?.id}:1`,
      `opencode/a:${cases[0]?.id}:2`,
      `opencode/a:${cases[1]?.id}:1`,
    ])
  })
})
