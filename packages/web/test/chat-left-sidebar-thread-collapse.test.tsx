import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DirectoryThreadRow } from "../src/components/layout/chat-left-sidebar/directory-list"
import { buildSessionChildrenByParent } from "../src/lib/session-family"
import type { SessionInfo, SessionStatusInfo } from "../src/state/chat-types"

async function flushEffects(delay = 0) {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delay)
    })
  })
}

async function waitForAssertion(assertion: () => void, timeoutMs = 2500) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await flushEffects(20)
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error("Timed out waiting for assertion")
}

describe("DirectoryThreadRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
      writable: true,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("collapses and expands subagent children from the row title", async () => {
    const sessions: SessionInfo[] = [
      {
        id: "subagent-parent",
        title: "Read AGENTS.md (@Dalton subagent)",
        time: {
          created: Date.now() - 120_000,
          updated: Date.now() - 120_000,
        },
      },
      {
        id: "subagent-child",
        title: "Nested follow-up",
        parentID: "subagent-parent",
        time: {
          created: Date.now() - 60_000,
          updated: Date.now() - 60_000,
        },
      },
    ]

    const childrenByParent = buildSessionChildrenByParent(sessions)
    const sessionsByID = new Map(sessions.map((session) => [session.id, session]))
    const sessionStatusByID: Record<string, SessionStatusInfo> = {}
    const pinnedSet = new Set<string>()
    const unreadMap: Record<string, true> = {}

    function Harness() {
      const [activeSessionID, setActiveSessionID] = useState<string | undefined>("outside-session")

      return (
        <DirectoryThreadRow
          directory="/repo"
          currentDirectory="/repo"
          session={sessions[0]}
          activeSessionID={activeSessionID}
          childrenByParent={childrenByParent}
          sessionsByID={sessionsByID}
          sessionStatusByID={sessionStatusByID}
          pinnedSet={pinnedSet}
          unreadMap={unreadMap}
          onSelectSession={setActiveSessionID}
          onTogglePin={() => {}}
          onToggleUnread={() => {}}
          onRequestRename={() => {}}
          onRequestArchive={() => {}}
        />
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await flushEffects()
    })

    expect(container.querySelector('button[data-session-id="subagent-child"]')).toBeNull()

    const parentButton = container.querySelector('button[data-session-id="subagent-parent"]')
    if (!(parentButton instanceof HTMLButtonElement)) {
      throw new Error("Subagent parent row not found")
    }

    await act(async () => {
      parentButton.click()
      await flushEffects(300)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('button[data-session-id="subagent-child"]')).not.toBeNull()
    })

    await act(async () => {
      parentButton.click()
      await flushEffects(300)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('button[data-session-id="subagent-child"]')).toBeNull()
    })

    await act(async () => {
      parentButton.click()
      await flushEffects(300)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('button[data-session-id="subagent-child"]')).not.toBeNull()
    })
  })

  test("selects the parent subagent session when a nested child is active", async () => {
    const sessions: SessionInfo[] = [
      {
        id: "subagent-parent",
        title: "Read AGENTS.md (@Dalton subagent)",
        time: {
          created: Date.now() - 120_000,
          updated: Date.now() - 120_000,
        },
      },
      {
        id: "subagent-child",
        title: "Nested follow-up (@Riley subagent)",
        parentID: "subagent-parent",
        time: {
          created: Date.now() - 60_000,
          updated: Date.now() - 60_000,
        },
      },
    ]

    const childrenByParent = buildSessionChildrenByParent(sessions)
    const sessionsByID = new Map(sessions.map((session) => [session.id, session]))
    const sessionStatusByID: Record<string, SessionStatusInfo> = {}
    const pinnedSet = new Set<string>()
    const unreadMap: Record<string, true> = {}

    function Harness() {
      const [activeSessionID, setActiveSessionID] = useState<string | undefined>("subagent-child")

      return (
        <>
          <div data-testid="active-session">{activeSessionID}</div>
          <DirectoryThreadRow
            directory="/repo"
            currentDirectory="/repo"
            session={sessions[0]}
            activeSessionID={activeSessionID}
            childrenByParent={childrenByParent}
            sessionsByID={sessionsByID}
            sessionStatusByID={sessionStatusByID}
            pinnedSet={pinnedSet}
            unreadMap={unreadMap}
            onSelectSession={setActiveSessionID}
            onTogglePin={() => {}}
            onToggleUnread={() => {}}
            onRequestRename={() => {}}
            onRequestArchive={() => {}}
          />
        </>
      )
    }

    await act(async () => {
      root.render(<Harness />)
      await flushEffects()
    })

    const parentButton = container.querySelector('button[data-session-id="subagent-parent"]')
    if (!(parentButton instanceof HTMLButtonElement)) {
      throw new Error("Subagent parent row not found")
    }

    await act(async () => {
      parentButton.click()
      await flushEffects(300)
    })

    await waitForAssertion(() => {
      expect(container.querySelector('[data-testid="active-session"]')?.textContent).toBe(
        "subagent-parent",
      )
    })
  })
})
