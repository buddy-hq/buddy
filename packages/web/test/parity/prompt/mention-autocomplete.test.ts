import { describe, expect, test } from "bun:test"
import {
  filterMentionOptions,
  filterMentionableAgents,
  getMentionMatch,
} from "../../../src/components/prompt/mention-autocomplete"

describe("mention autocomplete", () => {
  test("finds an @ mention at a word boundary", () => {
    expect(getMentionMatch("Use @expl", "Use @expl".length)).toEqual({
      start: 4,
      end: 9,
      query: "expl",
    })
  })

  test("ignores @ inside other words", () => {
    expect(getMentionMatch("email@explore", "email@explore".length)).toBeUndefined()
  })

  test("ranks prefix matches ahead of contains matches", () => {
    const agents = filterMentionableAgents(
      [
        { name: "general" },
        { name: "curriculum-orchestrator" },
        { name: "explore" },
      ],
      "ex",
    )

    expect(agents.map((agent) => agent.name)).toEqual(["explore"])
  })

  test("keeps alphabetical order within the same match class", () => {
    const agents = filterMentionableAgents(
      [
        { name: "general" },
        { name: "genie" },
      ],
      "ge",
    )

    expect(agents.map((agent) => agent.name)).toEqual(["general", "genie"])
  })

  test("places agents before recent and searched files", () => {
    const options = filterMentionOptions(
      [{ name: "explore" }],
      [
        { path: "src/routes/$directory.chat.tsx" },
        { path: "src/components/prompt/prompt-composer.tsx", recent: true },
      ],
      "",
    )

    expect(options).toEqual([
      { type: "agent", name: "explore", description: undefined },
      {
        type: "file",
        path: "src/components/prompt/prompt-composer.tsx",
        description: undefined,
        recent: true,
      },
      {
        type: "file",
        path: "src/routes/$directory.chat.tsx",
        description: undefined,
        recent: undefined,
      },
    ])
  })
})
