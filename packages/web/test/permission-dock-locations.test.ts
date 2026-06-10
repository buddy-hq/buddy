import { describe, expect, test } from "bun:test"
import { getPermissionDockBody } from "../src/lib/permission-dock-locations"

describe("permission dock body", () => {
  test("shows folder only when external access has no specific file", () => {
    expect(
      getPermissionDockBody({
        id: "per_location",
        sessionID: "ses_location",
        permission: "external_directory",
        patterns: ["/Users/example/Desktop/*"],
        always: ["/Users/example/Desktop/*"],
        metadata: { parentDir: "/Users/example/Desktop" },
      }),
    ).toEqual({
      kind: "external_directory",
      file: undefined,
      command: undefined,
      folders: ["/Users/example/Desktop/*"],
    })
  })

  test("shows file and folder for external file access", () => {
    expect(
      getPermissionDockBody({
        id: "per_file",
        sessionID: "ses_file",
        permission: "external_directory",
        patterns: ["/Users/example/Desktop/*"],
        always: ["/Users/example/Desktop/*"],
        metadata: {
          filepath: "/Users/example/Desktop/buddy-permission-test.md",
          parentDir: "/Users/example/Desktop",
        },
      }),
    ).toEqual({
      kind: "external_directory",
      file: "/Users/example/Desktop/buddy-permission-test.md",
      command: undefined,
      folders: ["/Users/example/Desktop/*"],
    })
  })

  test("shows command and folders for external shell access", () => {
    expect(
      getPermissionDockBody({
        id: "per_shell",
        sessionID: "ses_shell",
        permission: "external_directory",
        patterns: ["/Users/example/Desktop/*"],
        always: ["/Users/example/Desktop/*"],
        metadata: {
          command: "cat /Users/example/Desktop/*.md",
          directories: ["/Users/example/Desktop"],
        },
      }),
    ).toEqual({
      kind: "external_directory",
      file: undefined,
      command: "cat /Users/example/Desktop/*.md",
      folders: ["/Users/example/Desktop/*"],
    })
  })

  test("hides detail lines when the headline already names the file", () => {
    expect(
      getPermissionDockBody({
        id: "per_read",
        sessionID: "ses_read",
        permission: "read",
        patterns: ["README.md"],
        always: [],
        metadata: {},
      }),
    ).toEqual({ kind: "none" })
  })

  test("shows command body for bash permissions", () => {
    expect(
      getPermissionDockBody({
        id: "per_bash",
        sessionID: "ses_bash",
        permission: "bash",
        patterns: ["cat /Users/example/Desktop/buddy-permission-test.md"],
        always: [],
        metadata: { command: "cat /Users/example/Desktop/buddy-permission-test.md" },
      }),
    ).toEqual({
      kind: "command",
      command: "cat /Users/example/Desktop/buddy-permission-test.md",
    })
  })

  test("shows detail lines for external read paths", () => {
    expect(
      getPermissionDockBody({
        id: "per_read_external",
        sessionID: "ses_read_external",
        permission: "read",
        patterns: ["../resources/notes.md"],
        always: ["*"],
        metadata: {},
      }),
    ).toEqual({
      kind: "detail",
      lines: ["../resources/notes.md"],
    })
  })
})
