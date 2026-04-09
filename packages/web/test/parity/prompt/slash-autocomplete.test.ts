import { describe, expect, test } from "bun:test"
import {
  buildQuizSlashPrompt,
  buildQuizSlashPromptParts,
  filterSlashCommands,
  getSlashMatch,
  parseSlashCommandInput,
  QUIZ_SLASH_COMMAND_NAME,
  SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES,
} from "../../../src/components/prompt/slash-autocomplete"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  RESOURCE_REFERENCE_PART_TYPE,
} from "../../../src/components/prompt/prompt-types"

describe("slash autocomplete", () => {
  test("finds a slash command only when the prompt is a single slash token", () => {
    expect(getSlashMatch("/rev", "/rev".length)).toEqual({
      start: 0,
      end: 4,
      query: "rev",
    })
    expect(getSlashMatch("/review status", "/review".length)).toBeUndefined()
  })

  test("prefers server commands ahead of builtins when the query is empty", () => {
    const commands = filterSlashCommands(
      [
        { type: "custom" as const, name: "review" },
        { type: "builtin" as const, name: "new" },
      ],
      "",
    )

    expect(commands.map((command) => command.name)).toEqual(["review", "new"])
  })

  test("parses the selected slash command and preserves argument spacing", () => {
    expect(
      parseSlashCommandInput("/review   staged changes", [{ name: "review" }, { name: "compact" }]),
    ).toEqual({
      command: { name: "review" },
      arguments: "  staged changes",
    })
  })

  test("parses the local quiz slash command", () => {
    expect(parseSlashCommandInput("/quiz graphs", [{ name: QUIZ_SLASH_COMMAND_NAME }])).toEqual({
      command: { name: QUIZ_SLASH_COMMAND_NAME },
      arguments: "graphs",
    })
  })

  test("builds a contextual quiz prompt from slash command arguments", () => {
    expect(buildQuizSlashPrompt("graphs")).toContain("Create a quiz about graphs.")
    expect(buildQuizSlashPrompt("")).toContain("current conversation and context")
  })

  test("registers quiz among submitted builtin slash commands", () => {
    expect(SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES).toContain(QUIZ_SLASH_COMMAND_NAME)
  })

  test("rewrites quiz slash prompt parts without dropping structured references", () => {
    expect(
      buildQuizSlashPromptParts(
        [
          {
            type: PROMPT_PART_TYPE_TEXT,
            text: "/quiz build a set for ",
          },
          {
            type: PROMPT_PART_TYPE_AGENT,
            name: "question-set-author",
          },
          {
            type: RESOURCE_REFERENCE_PART_TYPE,
            key: "lesson-1",
          },
        ],
        "build a set for @question-set-author resource:lesson-1",
      ),
    ).toEqual([
      {
        type: PROMPT_PART_TYPE_TEXT,
        text: "Create a quiz about ",
      },
      {
        type: PROMPT_PART_TYPE_TEXT,
        text: "build a set for ",
      },
      {
        type: PROMPT_PART_TYPE_AGENT,
        name: "question-set-author",
      },
      {
        type: RESOURCE_REFERENCE_PART_TYPE,
        key: "lesson-1",
      },
      {
        type: PROMPT_PART_TYPE_TEXT,
        text: ". Use the question-set-author subagent if it is available.",
      },
    ])
  })
})
