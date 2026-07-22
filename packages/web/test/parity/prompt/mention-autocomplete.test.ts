import { describe, expect, test } from "bun:test"
import {
  filterMentionOptions,
  filterMentionableAgents,
  getMentionMatch,
} from "../../../src/components/prompt/mention-autocomplete"
import { PROMPT_STRUCTURED_MASK_CHAR } from "../../../src/components/prompt/prompt-types"

describe("mention autocomplete", () => {
  test("finds an @ mention before the cursor", () => {
    expect(getMentionMatch("Use @expl", "Use @expl".length)).toEqual({
      start: 4,
      end: 9,
      query: "expl",
    })
  })

  test("triggers anywhere before the cursor, like opencode — even mid-word", () => {
    // Vendor parity: `/@(\S*)$/` on the text before the cursor, so `@` right
    // after an abandoned "/quer" (or any word) still opens the menu.
    expect(getMentionMatch("/dds@", "/dds@".length)).toEqual({
      start: 4,
      end: 5,
      query: "",
    })
    expect(getMentionMatch("email@explore", "email@explore".length)).toEqual({
      start: 5,
      end: 13,
      query: "explore",
    })
  })

  test("never matches into a masked pill and stops at whitespace", () => {
    // A pill's serialized text ("@node_modules/@types/…") arrives masked; its
    // `@` characters must not open the menu while typing after the pill.
    const maskedPill = PROMPT_STRUCTURED_MASK_CHAR.repeat("@a/b.ts".length)
    expect(getMentionMatch(`${maskedPill} sdskd`, `${maskedPill} sdskd`.length)).toBeUndefined()
    // Whitespace between the `@` and the cursor ends the trigger.
    expect(getMentionMatch("@file.md done", "@file.md done".length)).toBeUndefined()
    // A pill between the `@` and the cursor ends it too.
    expect(getMentionMatch(`@ab${maskedPill}`, `@ab${maskedPill}`.length)).toBeUndefined()
  })

  test("ranks prefix matches ahead of contains matches", () => {
    const agents = filterMentionableAgents(
      [{ name: "general" }, { name: "curriculum-orchestrator" }, { name: "explore" }],
      "ex",
    )

    expect(agents.map((agent) => agent.name)).toEqual(["explore"])
  })

  test("keeps alphabetical order within the same match class", () => {
    const agents = filterMentionableAgents([{ name: "general" }, { name: "genie" }], "ge")

    expect(agents.map((agent) => agent.name)).toEqual(["general", "genie"])
  })

  test("places v2 references before agents, recent files, and searched files", () => {
    const options = filterMentionOptions(
      [
        {
          name: "docs",
          path: "/reference-cache/docs",
          description: "Shared documentation",
        },
      ],
      [{ name: "explore" }],
      [
        { path: "src/routes/$directory.chat.tsx" },
        { path: "src/components/prompt/prompt-composer.tsx", recent: true },
      ],
      "",
    )

    expect(options).toEqual([
      {
        type: "reference",
        name: "docs",
        path: "/reference-cache/docs",
        description: "Shared documentation",
      },
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

  test("filters v2 references by alias instead of materialized path", () => {
    const options = filterMentionOptions(
      [{ name: "design-system", path: "/cache/a1b2c3", description: "UI guidance" }],
      [],
      [],
      "design",
    )

    expect(options).toEqual([
      {
        type: "reference",
        name: "design-system",
        path: "/cache/a1b2c3",
        description: "UI guidance",
      },
    ])
  })
})
