import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DirectoryChatReadingThreadBrowser } from "../src/components/directory-chat/directory-chat-reading-thread-browser"

describe("DirectoryChatReadingThreadBrowser", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("returns to the parent session when the current reading thread is a subagent session", async () => {
    const selectedSessionIDs: string[] = []

    await act(async () => {
      root.render(
        <DirectoryChatReadingThreadBrowser
          sessionTitle="Summarize chapter"
          sessions={[
            {
              id: "parent-session",
              title: "Read chapter 1",
              time: {
                created: Date.now() - 2_000,
                updated: Date.now() - 1_000,
              },
            },
            {
              id: "child-session",
              title: "Summarize chapter (@reading-subagent subagent)",
              parentID: "parent-session",
              time: {
                created: Date.now() - 1_000,
                updated: Date.now(),
              },
            },
          ]}
          activeSessionID="child-session"
          parentSession={{
            id: "parent-session",
            title: "Read chapter 1",
            time: {
              created: Date.now() - 2_000,
              updated: Date.now() - 1_000,
            },
          }}
          onNewSession={() => undefined}
          onSelectSession={(sessionID) => {
            selectedSessionIDs.push(sessionID)
          }}
        />,
      )
      await Promise.resolve()
    })

    const backButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Read chapter 1"),
    )

    expect(backButton).toBeTruthy()

    await act(async () => {
      backButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(selectedSessionIDs).toEqual(["parent-session"])
  })
})
