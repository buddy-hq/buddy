import { describe, expect, test } from "bun:test"
import { createPostCompactionTranscriptBuilder } from "./post-compaction-recall"

const THREAD_ID = "019f7164-cae1-7652-b6b7-90b538dac9aa"

describe("post-compaction recall transcript", () => {
  test("preserves visible messages and structured question answers", () => {
    const builder = createPostCompactionTranscriptBuilder(THREAD_ID, "2026-07-18")

    builder.addRecord({
      payload: {
        content: [
          { text: "<environment_context>hidden</environment_context>", type: "input_text" },
          { text: "Design this with me", type: "input_text" },
        ],
        role: "user",
        type: "message",
      },
      type: "response_item",
    })
    builder.addRecord({
      payload: {
        content: [{ text: "Which behavior do you want?", type: "output_text" }],
        phase: "commentary",
        role: "assistant",
        type: "message",
      },
      type: "response_item",
    })
    builder.addRecord({
      payload: {
        arguments: JSON.stringify({
          questions: [
            {
              header: "Placement",
              id: "placement",
              options: [
                {
                  description: "Keep the status at the live end.",
                  label: "Tail row",
                },
              ],
              question: "Where should the busy status appear?",
            },
          ],
        }),
        call_id: "question-call",
        name: "request_user_input",
        type: "function_call",
      },
      type: "response_item",
    })
    builder.addRecord({
      payload: {
        call_id: "question-call",
        output: JSON.stringify({
          answers: {
            placement: { answers: ["Tail row", "Keep it compact"] },
          },
        }),
        type: "function_call_output",
      },
      type: "response_item",
    })

    const transcript = builder.finish()

    expect(transcript.markdown).toContain("Design this with me")
    expect(transcript.markdown).toContain("Which behavior do you want?")
    expect(transcript.markdown).toContain("Where should the busy status appear?")
    expect(transcript.markdown).toContain("**Tail row** — Keep the status at the live end.")
    expect(transcript.markdown).toContain("Tail row\n> Keep it compact")
    expect(transcript.markdown).not.toContain("environment_context")
    expect(transcript.stats).toEqual({
      assistantMessages: 1,
      entries: 4,
      questionAnswers: 1,
      questionPrompts: 1,
      skippedTrailingRecord: false,
      userMessages: 1,
    })
  })

  test("ignores reasoning and non-question tool traffic", () => {
    const builder = createPostCompactionTranscriptBuilder(THREAD_ID)

    builder.addRecord({
      payload: { summary: ["private reasoning"], type: "reasoning" },
      type: "response_item",
    })
    builder.addRecord({
      payload: {
        arguments: "sensitive command",
        name: "exec",
        type: "custom_tool_call",
      },
      type: "response_item",
    })
    builder.addRecord({
      payload: {
        call_id: "unknown-call",
        output: "sensitive output",
        type: "function_call_output",
      },
      type: "response_item",
    })

    const transcript = builder.finish(true)

    expect(transcript.markdown).not.toContain("private reasoning")
    expect(transcript.markdown).not.toContain("sensitive command")
    expect(transcript.markdown).not.toContain("sensitive output")
    expect(transcript.markdown).toContain("one incomplete trailing JSONL record was skipped")
    expect(transcript.stats.entries).toBe(0)
    expect(transcript.stats.skippedTrailingRecord).toBe(true)
  })
})
