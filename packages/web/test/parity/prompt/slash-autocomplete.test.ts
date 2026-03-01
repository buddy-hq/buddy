import { describe, expect, test } from "bun:test"
import {
  filterSlashCommands,
  getSlashMatch,
  parseSlashCommandInput,
} from "../../../src/components/prompt/slash-autocomplete"

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
      parseSlashCommandInput("/review   staged changes", [
        { name: "review" },
        { name: "compact" },
      ]),
    ).toEqual({
      command: { name: "review" },
      arguments: "  staged changes",
    })
  })
})
