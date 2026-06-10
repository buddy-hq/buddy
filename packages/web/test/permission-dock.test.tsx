import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PermissionDock } from "../src/components/directory-chat/permission-dock"
import type { PermissionReply } from "../src/state/permission-types"

describe("permission dock", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows file and folder labels for external directory access", async () => {
    const replies: PermissionReply[] = []

    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_scope",
            sessionID: "ses_scope",
            permission: "external_directory",
            patterns: ["/Users/example/Downloads/*"],
            always: ["/Users/example/Downloads/*"],
            metadata: {
              filepath: "/Users/example/Downloads/file.pdf",
              parentDir: "/Users/example/Downloads",
            },
          }}
          onReply={async (reply) => {
            replies.push(reply)
          }}
        />,
      )
    })

    expect(container.textContent).toContain("Permission needed: Access external folder")
    expect(container.textContent).not.toContain("external_directory")
    expect(container.textContent).toContain("File")
    expect(container.textContent).toContain("…")
    expect(container.textContent).toContain("Downloads/file.pdf")
    expect(container.textContent).toContain("Folder")
    expect(container.textContent).toContain("…")
    expect(container.textContent).toContain("Downloads/*")
    expect(container.querySelector('[data-scope="file"] [dir="rtl"]')).not.toBeNull()
    expect(container.querySelector('[data-scope="folder"] [dir="rtl"]')).not.toBeNull()
    expect(container.textContent).not.toContain("This request")
    expect(container.textContent).not.toContain("Also allows")

    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((button) => button.textContent)).toEqual(["Reject", "Allow always", "Allow once"])

    await act(async () => {
      buttons[1]?.click()
    })

    expect(replies).toEqual(["always"])
  })

  test("shows only folder when external access has no file", async () => {
    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_location",
            sessionID: "ses_location",
            permission: "external_directory",
            patterns: ["/Users/example/Desktop/*"],
            always: ["/Users/example/Desktop/*"],
            metadata: { parentDir: "/Users/example/Desktop" },
          }}
          onReply={async () => {}}
        />,
      )
    })

    expect(container.textContent).toContain("Permission needed: Access external folder")
    expect(container.textContent).toContain("Folder")
    expect(container.textContent).toContain("…")
    expect(container.textContent).toContain("Desktop/*")
    expect(container.textContent).not.toContain("File")
    expect(container.textContent).not.toContain("Command")
  })

  test("shows command and folder for external shell access", async () => {
    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_shell",
            sessionID: "ses_shell",
            permission: "external_directory",
            patterns: ["/Users/example/Desktop/*"],
            always: ["/Users/example/Desktop/*"],
            metadata: {
              command: "cat /Users/example/Desktop/*.md",
              directories: ["/Users/example/Desktop"],
            },
          }}
          onReply={async () => {}}
        />,
      )
    })

    expect(container.textContent).toContain("Permission needed: Access external folder")
    expect(container.textContent).toContain("Command")
    expect(container.textContent).toContain("cat /Users/example/Desktop/*.md")
    expect(container.textContent).toContain("Folder")
    expect(container.textContent).not.toContain("File")
  })

  test("shows bash command without path truncation", async () => {
    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_bash",
            sessionID: "ses_bash",
            permission: "bash",
            patterns: ["cat /Users/example/Desktop/buddy-permission-test.md"],
            always: [],
            metadata: { command: "cat /Users/example/Desktop/buddy-permission-test.md" },
          }}
          onReply={async () => {}}
        />,
      )
    })

    expect(container.textContent).toContain("Permission needed: Run command")
    expect(container.textContent).toContain("cat /Users/example/Desktop/buddy-permission-test.md")
    expect(container.querySelector('[data-scope="detail"] [dir="rtl"]')).toBeNull()
  })

  test("shows contextual read headline and path for external reads", async () => {
    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_read_external",
            sessionID: "ses_read_external",
            permission: "read",
            patterns: ["../resources/notes.md"],
            always: ["*"],
            metadata: {},
          }}
          onReply={async () => {}}
        />,
      )
    })

    expect(container.textContent).toContain("Permission needed: Read notes.md")
    expect(container.textContent).toContain("../resources/notes.md")
    expect(container.textContent).not.toContain("File")
    expect(container.textContent).not.toContain("Folder")
  })

  test("keeps the native always action available when no reusable patterns are provided", async () => {
    await act(async () => {
      root.render(
        <PermissionDock
          request={{
            id: "per_once",
            sessionID: "ses_once",
            permission: "read",
            patterns: ["README.md"],
            always: [],
            metadata: {},
          }}
          onReply={async () => {}}
        />,
      )
    })

    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((button) => button.textContent)).toEqual(["Reject", "Allow always", "Allow once"])
    expect(buttons.every((button) => !button.disabled)).toBe(true)
    expect(container.textContent).toContain("Permission needed: Read README.md")
  })
})
