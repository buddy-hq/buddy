import { describe, expect, test } from "bun:test"

import {
  reasoningBodyWithoutLeadingHeading,
  reasoningHeading,
} from "../src/components/chat/utils/markdown"

describe("reasoningHeading", () => {
  test("extracts an ATX markdown heading", () => {
    expect(reasoningHeading("## Inspecting git worktree list and status")).toBe(
      "Inspecting git worktree list and status",
    )
  })

  test("extracts an HTML heading", () => {
    expect(reasoningHeading("<h2>Planning the summary</h2>\nbody")).toBe("Planning the summary")
  })

  test("extracts a setext heading", () => {
    expect(reasoningHeading("Reviewing the diff\n==================\nbody")).toBe(
      "Reviewing the diff",
    )
  })

  // OpenAI reasoning summaries title each section with a bold line, not a
  // markdown heading — this is the case that regressed for OpenAI models.
  test("extracts a bold-only line as a heading", () => {
    expect(
      reasoningHeading(
        "**Inspecting git worktree list and status**\n\nI'll run git worktree list.",
      ),
    ).toBe("Inspecting git worktree list and status")
  })

  test("extracts a bold line written with underscores", () => {
    expect(reasoningHeading("__Gathering context__")).toBe("Gathering context")
  })

  test("prefers the leading title over later section headings", () => {
    expect(
      reasoningHeading("**Searching the workspace**\n\nLook at files.\n\n## Results\nFound them."),
    ).toBe("Searching the workspace")
  })

  test("requires matching bold delimiters", () => {
    expect(reasoningHeading("**Gathering context__")).toBeUndefined()
  })

  test("ignores inline bold inside a sentence", () => {
    expect(reasoningHeading("I will **carefully** inspect the tree.")).toBeUndefined()
  })

  test("does not treat a sentence with multiple bold spans as a title", () => {
    expect(reasoningHeading("**Check files** and **compare versions**")).toBeUndefined()
  })

  test("returns undefined when there is no heading", () => {
    expect(reasoningHeading("just some plain reasoning text")).toBeUndefined()
  })
})

describe("reasoningBodyWithoutLeadingHeading", () => {
  test("omits a title-only OpenAI summary from expanded content", () => {
    expect(reasoningBodyWithoutLeadingHeading("**Searching workspace for session ID**")).toBe("")
  })

  test("keeps the actual reasoning after its leading title", () => {
    expect(
      reasoningBodyWithoutLeadingHeading(
        "**Searching workspace for session ID**\n\nI checked the available session records.",
      ),
    ).toBe("I checked the available session records.")
    expect(reasoningBodyWithoutLeadingHeading("## Planning\n\nFirst, inspect the files.")).toBe(
      "First, inspect the files.",
    )
  })

  test("preserves prose and headings that are not the leading title", () => {
    const reasoning = "First, inspect the files.\n\n## Results\nFound two matches."
    expect(reasoningBodyWithoutLeadingHeading(reasoning)).toBe(reasoning)
  })

  test("preserves prose before a dash separator", () => {
    const reasoning = "I should check the session store before answering.\n---\nThe store is here."
    expect(reasoningBodyWithoutLeadingHeading(reasoning)).toBe(reasoning)
    expect(reasoningBodyWithoutLeadingHeading("Consider these\n-\nitem")).toBe(
      "Consider these\n-\nitem",
    )
  })

  test("removes only the leading title when later sections have headings", () => {
    expect(
      reasoningBodyWithoutLeadingHeading(
        "**Searching the workspace**\n\nLook at files.\n\n## Results\nFound them.",
      ),
    ).toBe("Look at files.\n\n## Results\nFound them.")
  })

  test("preserves a bold sentence and linked heading in the expanded body", () => {
    const sentence = "**Check files** and **compare versions**\n\nThe versions differ."
    expect(reasoningBodyWithoutLeadingHeading(sentence)).toBe(sentence)

    const linkedHeading = "## [Investigation](https://example.com)\n\nI checked the source."
    expect(reasoningBodyWithoutLeadingHeading(linkedHeading)).toBe(linkedHeading)
  })
})
