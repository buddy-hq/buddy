import {
  MAX_RELEASE_NOTE_ITEMS,
  MAX_RELEASE_NOTE_ITEM_LENGTH,
  parseReleaseNoteItems,
} from "../../packages/update-contract/src/release-notes"

export const MAX_RELEASE_BODY_LENGTH = 120_000
export const RAW_RELEASE_NOTES_HEADER = "# Raw release notes input — replace with user-facing notes"

export function validateReleaseNotes(input: {
  readonly notes: string
  readonly body: string
}) {
  const errors: string[] = []
  const warnings: string[] = []
  const items = parseReleaseNoteItems(input.notes)
  if (items.length === 0) errors.push("Release notes must not be empty.")
  if (input.notes.includes(RAW_RELEASE_NOTES_HEADER)) {
    errors.push("Replace the raw input with user-facing notes. See docs/ops/releases/notes.md.")
  }
  if (input.body.length > MAX_RELEASE_BODY_LENGTH) {
    errors.push("The final release body exceeds the 120,000 character limit.")
  }
  if (items.length > MAX_RELEASE_NOTE_ITEMS) {
    warnings.push(
      `Release notes contain ${items.length} items; the app shows only the first ${MAX_RELEASE_NOTE_ITEMS}.`,
    )
  }
  for (const [index, item] of items.entries()) {
    if (item.length > MAX_RELEASE_NOTE_ITEM_LENGTH) {
      warnings.push(
        `Item ${index + 1} exceeds ${MAX_RELEASE_NOTE_ITEM_LENGTH} characters and will be truncated in the app.`,
      )
    }
    if (
      /^(?:fix|feat|perf|refactor|docs|style|test|build|ci|chore|revert|release|ignore)(?:\([^)]*\))?!?:/iu.test(item)
    ) {
      warnings.push(
        `Item ${index + 1} starts with a conventional-commit prefix; describe what changed for people using Buddy.`,
      )
    }
  }
  return { errors, warnings }
}

export function requireValidReleaseNotes(input: {
  readonly notes: string
  readonly body: string
}): void {
  const result = validateReleaseNotes(input)
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"))
  for (const warning of result.warnings) console.warn(`Release notes warning: ${warning}`)
}
