import { describe, expect, test } from "bun:test"
import { needsObsidianConnectionPrompt } from "../src/lib/use-open-existing-notebook"

describe("opening an existing notebook", () => {
  test("prompts only when an Obsidian vault is detected but not connected", () => {
    expect(
      needsObsidianConnectionPrompt({
        detected: true,
        connected: false,
        configDirectories: [".obsidian"],
      }),
    ).toBe(true)
    expect(
      needsObsidianConnectionPrompt({
        detected: true,
        connected: true,
        configDirectories: [".obsidian"],
      }),
    ).toBe(false)
    expect(
      needsObsidianConnectionPrompt({
        detected: false,
        connected: false,
        configDirectories: [],
      }),
    ).toBe(false)
  })
})
