import { describe, expect, test } from "bun:test"
import {
  BUDDY_DEV_APP_NAME,
  formatBuddyDevAppName,
} from "../src/shared/dev-app-name"

describe("development app name", () => {
  test("uses the Buddy Dev base name without an instance", () => {
    expect(formatBuddyDevAppName(undefined)).toBe(BUDDY_DEV_APP_NAME)
  })

  test("includes the normalized worktree instance name", () => {
    expect(formatBuddyDevAppName("  main  ")).toBe("Buddy Dev — main")
    expect(formatBuddyDevAppName("pdf-reader")).toBe("Buddy Dev — pdf-reader")
  })
})
