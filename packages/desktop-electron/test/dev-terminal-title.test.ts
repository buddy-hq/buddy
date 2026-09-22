import { describe, expect, test } from "bun:test"
import {
  applyDesktopDevTerminalTitle,
  formatDesktopDevTerminalTitle,
  writeDesktopDevTerminalTitle,
} from "../scripts/dev-terminal-title"

describe("desktop development terminal title", () => {
  test("labels the Buddy checkout with a panda and the current branch", () => {
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "buddy",
        branchName: "fix/browser-zoom-persistence",
      }),
    ).toBe("🐼 - fix/browser-zoom-persistence")
  })

  test("labels the Hippo worktree with a hippo and the current branch", () => {
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "hippo",
        branchName: "browser-opening-fix",
      }),
    ).toBe("🦛 - browser-opening-fix")
  })

  test("matches Buddy and Hippo checkout names without regard to case", () => {
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "Buddy",
        branchName: "main",
      }),
    ).toBe("🐼 - main")
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "HIPPO",
        branchName: "notes",
      }),
    ).toBe("🦛 - notes")
  })

  test("uses the branch name alone for other worktrees", () => {
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "skill-smith",
        branchName: "skill-smith",
      }),
    ).toBe("skill-smith")
  })

  test("falls back to the checkout name when the branch is empty", () => {
    expect(
      formatDesktopDevTerminalTitle({
        checkoutName: "buddy",
        branchName: "  ",
      }),
    ).toBe("🐼 - buddy")
  })

  test("writes an OSC title sequence on a TTY", () => {
    const writes: string[] = []

    writeDesktopDevTerminalTitle("🐼 - main", {
      isTTY: true,
      write(chunk) {
        writes.push(chunk)
        return true
      },
    })

    expect(writes).toEqual(["\x1b]0;🐼 - main\x07"])
  })

  test("does not write a title sequence when stdout is not a TTY", () => {
    const writes: string[] = []

    writeDesktopDevTerminalTitle("🐼 - main", {
      isTTY: false,
      write(chunk) {
        writes.push(chunk)
        return true
      },
    })

    expect(writes).toEqual([])
  })

  test("strips control characters before writing the title", () => {
    const writes: string[] = []

    writeDesktopDevTerminalTitle("🐼 - feat\u0007ure", {
      isTTY: true,
      write(chunk) {
        writes.push(chunk)
        return true
      },
    })

    expect(writes).toEqual(["\x1b]0;🐼 - feature\x07"])
  })

  test("applies the Hippo title from the worktree directory name", () => {
    const writes: string[] = []

    const title = applyDesktopDevTerminalTitle({
      repoRoot: "/Users/me/Code/buddies/hippo",
      branchName: "browser-opening-fix",
      stdout: {
        isTTY: true,
        write(chunk) {
          writes.push(chunk)
          return true
        },
      },
    })

    expect(title).toBe("🦛 - browser-opening-fix")
    expect(writes).toEqual(["\x1b]0;🦛 - browser-opening-fix\x07"])
  })
})
