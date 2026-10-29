import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { PermissionDock } from "../src/components/directory-chat/permission-dock"
import type { PermissionReply } from "../src/state/permission-types"

describe("permission dock", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
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
            action: "outside_notebook",
            resources: ["/Users/example/Downloads/*"],
            save: ["/Users/example/Downloads/*"],
            file: "/Users/example/Downloads/file.pdf",
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
    expect(container.textContent).not.toContain("outside_notebook")
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
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Deny with feedback",
      "Deny",
      "Always allow",
      "Allow once",
    ])

    await act(async () => {
      buttons.find((button) => button.textContent === "Always allow")?.click()
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
            action: "outside_notebook",
            resources: ["/Users/example/Desktop/*"],
            save: ["/Users/example/Desktop/*"],
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
            action: "outside_notebook",
            resources: ["/Users/example/Desktop/*"],
            save: ["/Users/example/Desktop/*"],
            command: "cat /Users/example/Desktop/*.md",
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
            action: "shell",
            resources: ["cat /Users/example/Desktop/buddy-permission-test.md"],
            save: [],
            command: "cat /Users/example/Desktop/buddy-permission-test.md",
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
            action: "read",
            resources: ["../resources/notes.md"],
            save: ["*"],
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
            action: "read",
            resources: ["README.md"],
            save: [],
            metadata: {},
          }}
          onReply={async () => {}}
        />,
      )
    })

    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Deny with feedback",
      "Deny",
      "Always allow",
      "Allow once",
    ])
    expect(buttons.every((button) => !button.disabled)).toBe(true)
    expect(container.textContent).toContain("Permission needed: Read README.md")
  })
  test("rejects with the user's feedback and does not reuse it for the next request", async () => {
    const replies: PermissionReply[] = []
    const render = (id: string) =>
      root.render(
        <PermissionDock
          request={{
            id,
            sessionID: "ses_1",
            action: "shell",
            resources: ["rm file"],
            save: ["rm *"],
          }}
          onReply={async (reply) => {
            replies.push(reply)
          }}
        />,
      )
    await act(async () => render("per_1"))
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Deny with feedback")
        ?.click(),
    )
    const textarea = container.querySelector("textarea")
    expect(textarea).not.toBeNull()
    if (!textarea) throw new Error("Missing feedback input")
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(textarea, "Keep the file and read it instead")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Deny and send feedback")
        ?.click(),
    )
    expect(replies).toEqual([{ reply: "reject", message: "Keep the file and read it instead" }])
    await act(async () => render("per_2"))
    expect(container.querySelector("textarea")).toBeNull()
  })
})
