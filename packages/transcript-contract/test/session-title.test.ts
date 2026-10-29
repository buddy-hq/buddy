import { describe, expect, test } from "bun:test"

import { createForkedSessionTitle, removeForkTitleLineage } from "../src/session-title"

describe("forked session titles", () => {
  test("uses a compact numbered suffix for the first fork", () => {
    expect(createForkedSessionTitle({ title: "Explain closures", metadata: undefined }).title).toBe(
      "Explain closures (2)",
    )
  })

  test("increments forks using explicit lineage", () => {
    const first = createForkedSessionTitle({ title: "Explain closures", metadata: undefined })
    expect(createForkedSessionTitle(first).title).toBe("Explain closures (3)")
  })

  test("does not interpret a natural numeric suffix as fork lineage", () => {
    expect(
      createForkedSessionTitle({ title: "Annual plan (2025)", metadata: undefined }).title,
    ).toBe("Annual plan (2025) (2)")
  })

  test("adapts the current vendor fork suffix into Buddy lineage", () => {
    expect(
      createForkedSessionTitle({ title: "Explain closures (fork #4)", metadata: undefined }).title,
    ).toBe("Explain closures (6)")
  })

  test("clears lineage when a fork is renamed", () => {
    const fork = createForkedSessionTitle({ title: "Explain closures", metadata: undefined })
    expect(removeForkTitleLineage(fork.metadata)).toBeUndefined()
  })
})
