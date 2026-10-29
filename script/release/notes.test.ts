import { describe, expect, test } from "bun:test"
import { formatBetaReleaseBody } from "@buddy/script/release-stream"
import { RAW_RELEASE_NOTES_HEADER, validateReleaseNotes } from "./notes"
import { spawnSync } from "node:child_process"
import path from "node:path"

describe("authored release notes validation", () => {
  test.each(["", " \n\t", "## Only a heading\n\n"])("rejects empty notes %j", (notes) => {
    expect(validateReleaseNotes({ notes, body: notes }).errors).toContain(
      "Release notes must not be empty.",
    )
  })

  test("rejects the raw writer input", () => {
    const notes = `${RAW_RELEASE_NOTES_HEADER}\n- abc1234 fix: raw input`
    expect(validateReleaseNotes({ notes, body: notes }).errors.join(" ")).toContain(
      "Replace the raw input",
    )
  })

  test.each(["prod", "beta"] as const)("rejects a final %s body above the cap", (channel) => {
    const notes = "&".repeat(channel === "beta" ? 25_000 : 120_001)
    const body = channel === "beta" ? formatBetaReleaseBody(notes) : notes
    expect(validateReleaseNotes({ notes, body }).errors.join(" ")).toContain("120,000")
    const exact = "a".repeat(120_000)
    expect(validateReleaseNotes({ notes: exact, body: exact }).errors).toEqual([])
  })

  test("warns about item count using the app's heading, markup and duplicate rules", () => {
    const notes = `## New\n\nAn introduction uses one slot.\n${Array.from({ length: 8 }, (_, index) => `- Change ${index}`).join("\n")}\n- **Change 0**`
    const result = validateReleaseNotes({ notes, body: notes })
    expect(result.errors).toEqual([])
    expect(result.warnings.join(" ")).toContain("9 items")
    expect(result.warnings.join(" ")).toContain("first 8")
  })

  test("warns for long items beyond the first eight", () => {
    const notes = `${Array.from({ length: 8 }, (_, index) => `- Change ${index}`).join("\n")}\n- ${"x".repeat(221)}`
    const result = validateReleaseNotes({ notes, body: notes })
    expect(result.errors).toEqual([])
    expect(result.warnings.join(" ")).toContain("Item 9")
    expect(result.warnings.join(" ")).toContain("220")
  })

  test.each(["fix:", "feat(chat):", "refactor!:", "perf:", "docs:", "chore:"])(
    "warns about conventional prefix %s",
    (prefix) => {
      const notes = `- **${prefix}** A change`
      const result = validateReleaseNotes({ notes, body: notes })
      expect(result.errors).toEqual([])
      expect(result.warnings.join(" ")).toContain("conventional-commit prefix")
    },
  )

  test("accepts concise user-facing notes at the item limits", () => {
    const notes = `## New\n- ${"a".repeat(220)}\n${Array.from({ length: 7 }, (_, index) => `- Change ${index}`).join("\n")}`
    expect(validateReleaseNotes({ notes, body: formatBetaReleaseBody(notes) })).toEqual({
      errors: [],
      warnings: [],
    })
  })

  test("prints warnings and continues for valid notes", () => {
    const notes = `- fix: ${"x".repeat(221)}\n${Array.from({ length: 8 }, (_, index) => `- Change ${index}`).join("\n")}`
    const result = spawnSync(
      process.execPath,
      [
        "--eval",
        `import { requireValidReleaseNotes } from ${JSON.stringify(path.join(import.meta.dir, "notes.ts"))}; const notes = ${JSON.stringify(notes)}; requireValidReleaseNotes({ notes, body: notes }); console.log("Accepted");`,
      ],
      { env: process.env, encoding: "utf8" },
    )
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("Accepted")
    expect(result.stderr).toContain("first 8")
    expect(result.stderr).toContain("220")
    expect(result.stderr).toContain("conventional-commit prefix")
  })
})
