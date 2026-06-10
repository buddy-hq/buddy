import { describe, expect, test } from "bun:test"
import { getPermissionDockHeadline } from "../src/lib/permission-dock-headline"

describe("permission dock headline", () => {
  test("describes external directory access in the title", () => {
    const headline = getPermissionDockHeadline({
      id: "per_external",
      sessionID: "ses_external",
      permission: "external_directory",
      patterns: ["/Users/example/Desktop/*"],
      always: ["/Users/example/Desktop/*"],
      metadata: {
        parentDir: "/Users/example/Desktop",
      },
    })

    expect(headline.title).toBe("Permission needed: Access external folder")
    expect(headline.icon).toBe("shield")
  })

  test("describes read permissions by filename in the title", () => {
    const headline = getPermissionDockHeadline({
      id: "per_read",
      sessionID: "ses_read",
      permission: "read",
      patterns: ["README.md"],
      always: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Read README.md")
    expect(headline.icon).toBe("read")
  })

  test("describes edit permissions as edit file", () => {
    const headline = getPermissionDockHeadline({
      id: "per_edit",
      sessionID: "ses_edit",
      permission: "edit",
      patterns: ["notes.md"],
      always: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Edit notes.md")
    expect(headline.icon).toBe("edit")
  })

  test("describes apply_patch permissions as edit file", () => {
    const headline = getPermissionDockHeadline({
      id: "per_patch",
      sessionID: "ses_patch",
      permission: "apply_patch",
      patterns: ["src/app.tsx"],
      always: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Edit app.tsx")
    expect(headline.icon).toBe("edit")
  })

  test("describes bash permissions with command icon", () => {
    const headline = getPermissionDockHeadline({
      id: "per_bash",
      sessionID: "ses_bash",
      permission: "bash",
      patterns: ["ls"],
      always: [],
      metadata: { command: "ls" },
    })

    expect(headline.icon).toBe("command")
    expect(headline.title).toBe("Permission needed: Run command")
  })

  test("keeps a generic title for other permissions", () => {
    const headline = getPermissionDockHeadline({
      id: "per_grep",
      sessionID: "ses_grep",
      permission: "grep",
      patterns: ["src/**"],
      always: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed")
    expect(headline.icon).toBe("shield")
  })
})
