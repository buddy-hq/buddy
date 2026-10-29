import { describe, expect, test } from "bun:test"
import { getPermissionDockHeadline } from "../src/components/directory-chat/permission-dock-title"

describe("permission dock headline", () => {
  test("describes external directory access in the title", () => {
    const headline = getPermissionDockHeadline({
      id: "per_external",
      sessionID: "ses_external",
      action: "outside_notebook",
      resources: ["/Users/example/Desktop/*"],
      save: ["/Users/example/Desktop/*"],
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
      action: "read",
      resources: ["README.md"],
      save: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Read README.md")
    expect(headline.icon).toBe("read")
  })

  test("describes edit permissions as edit file", () => {
    const headline = getPermissionDockHeadline({
      id: "per_edit",
      sessionID: "ses_edit",
      action: "edit",
      resources: ["notes.md"],
      save: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Edit notes.md")
    expect(headline.icon).toBe("edit")
  })

  test("describes bash permissions with command icon", () => {
    const headline = getPermissionDockHeadline({
      id: "per_bash",
      sessionID: "ses_bash",
      action: "shell",
      resources: ["ls"],
      save: [],
      metadata: { command: "ls" },
    })

    expect(headline.icon).toBe("command")
    expect(headline.title).toBe("Permission needed: Run command")
  })

  test("keeps a generic title for other permissions", () => {
    const headline = getPermissionDockHeadline({
      id: "per_grep",
      sessionID: "ses_grep",
      action: "grep",
      resources: ["src/**"],
      save: [],
      metadata: {},
    })

    expect(headline.title).toBe("Permission needed: Search file contents")
    expect(headline.icon).toBe("read")
  })
})
