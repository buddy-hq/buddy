import { describe, expect, test } from "bun:test"
import {
  buildQuizSlashPrompt,
  buildQuizSlashPromptParts,
  filterSlashCommands,
  getSlashMatch,
  parseSlashCommandInput,
  QUIZ_SLASH_COMMAND_NAME,
} from "../../../src/components/prompt/slash-autocomplete"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  PROMPT_STRUCTURED_MASK_CHAR,
  RESOURCE_REFERENCE_PART_TYPE,
} from "../../../src/components/prompt/prompt-types"

describe("slash autocomplete", () => {
  test("triggers a slash command at the start or after whitespace, like @", () => {
    expect(getSlashMatch("/rev", "/rev".length)).toEqual({
      start: 0,
      end: 4,
      query: "rev",
    })
    // Reachable after whitespace following a mention pill.
    const afterMention = "@file.md /rev"
    expect(getSlashMatch(afterMention, afterMention.length)).toEqual({
      start: 9,
      end: 13,
      query: "rev",
    })
    // Not inside a word ("and/or") or a URL ("https://").
    expect(getSlashMatch("and/or", "and/or".length)).toBeUndefined()
    expect(getSlashMatch("https://x", "https://x".length)).toBeUndefined()
    // The command token ends at the first space.
    expect(getSlashMatch("/review ", "/review ".length)).toBeUndefined()
  })

  test("triggers immediately after a pill and never matches into one", () => {
    // A pill (masked upstream) is a boundary, so `/` right after it triggers.
    const pill = PROMPT_STRUCTURED_MASK_CHAR.repeat("@file.md".length)
    expect(getSlashMatch(`${pill}/rev`, `${pill}/rev`.length)).toEqual({
      start: pill.length,
      end: pill.length + 4,
      query: "rev",
    })
    // A `/` inside a pill's masked text can never feed the menu.
    const pathPill = PROMPT_STRUCTURED_MASK_CHAR.repeat("@a/b/c.ts".length)
    expect(getSlashMatch(pathPill, pathPill.length)).toBeUndefined()
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
