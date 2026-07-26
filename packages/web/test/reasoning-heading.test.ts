import { describe, expect, test } from "bun:test"

import { reasoningHeading } from "../src/components/chat/utils/markdown"

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

  test("requires matching bold delimiters", () => {
    expect(reasoningHeading("**Gathering context__")).toBeUndefined()
  })

  test("ignores inline bold inside a sentence", () => {
    expect(reasoningHeading("I will **carefully** inspect the tree.")).toBeUndefined()
  })

  test("returns undefined when there is no heading", () => {
    expect(reasoningHeading("just some plain reasoning text")).toBeUndefined()
  })
})
