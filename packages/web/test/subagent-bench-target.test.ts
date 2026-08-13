import { describe, expect, test } from "bun:test"
import {
  openOwnedSubagentBench,
  subagentBenchSelection,
} from "../src/lib/subagent-bench-target"

const SESSIONS = [
  { id: "chat-a" },
  { id: "chat-a-child", parentID: "chat-a" },
  { id: "chat-a-grandchild", parentID: "chat-a-child" },
  { id: "chat-b" },
]
const SESSION_BENCH_SURFACE_SOURCE = new URL(
  "../src/components/bench/surfaces/session-bench-surface.tsx",
  import.meta.url,
)
const DIRECTORY_WORKSPACE_ROOT_SOURCE = new URL(
  "../src/components/directory-chat/directory-workspace-root.tsx",
  import.meta.url,
)

describe("subagent Bench ownership", () => {
  test("resolves a subagent to its root owner chat", () => {
    expect(subagentBenchSelection(SESSIONS, "chat-a-child")).toEqual({
      ownerSessionID: "chat-a",
      target: { type: "session", sessionID: "chat-a-child" },
    })
    expect(subagentBenchSelection(SESSIONS, "chat-a-grandchild")).toEqual({
      ownerSessionID: "chat-a",
      target: { type: "session", sessionID: "chat-a-grandchild" },
    })
  })

  test("does not turn root chats or unknown sessions into Bench targets", () => {
    expect(subagentBenchSelection(SESSIONS, "chat-b")).toBeUndefined()
    expect(subagentBenchSelection(SESSIONS, "missing")).toBeUndefined()
    expect(
      subagentBenchSelection(
        [
          { id: "cycle-a", parentID: "cycle-b" },
          { id: "cycle-b", parentID: "cycle-a" },
        ],
        "cycle-a",
      ),
    ).toBeUndefined()
  })

  test("activates the owner chat before opening its subagent Bench tab", async () => {
    const calls: string[] = []
    const result = await openOwnedSubagentBench({
      directory: "/notebook",
      sessionID: "chat-a-child",
      sessions: SESSIONS,
      activeDirectory: "/notebook",
      activeSessionID: "chat-b",
      selectSession: async (_directory, sessionID) => {
        calls.push(`select:${sessionID}`)
        return true
      },
      openSubagentBench: async (_directory, sessionID) => {
        calls.push(`open:${sessionID}`)
        return true
      },
    })

    expect(result).toBe(true)
    expect(calls).toEqual(["select:chat-a", "open:chat-a-child"])
  })

  test("does not open the tab when selecting its owner chat fails", async () => {
    const calls: string[] = []
    const result = await openOwnedSubagentBench({
      directory: "/notebook",
      sessionID: "chat-a-child",
      sessions: SESSIONS,
      activeDirectory: "/notebook",
      activeSessionID: "chat-b",
      selectSession: async () => false,
      openSubagentBench: async (_directory, sessionID) => {
        calls.push(sessionID)
        return true
      },
    })

    expect(result).toBe(false)
    expect(calls).toEqual([])
  })

  test("nested subagent links delegate to the root owner-aware navigation path", async () => {
    const [sessionSurface, workspaceRoot] = await Promise.all([
      Bun.file(SESSION_BENCH_SURFACE_SOURCE).text(),
      Bun.file(DIRECTORY_WORKSPACE_ROOT_SOURCE).text(),
    ])

    expect(sessionSurface).not.toContain("useOpenSubagentBench")
    expect(sessionSurface).toContain("onOpenSession={props.onOpenSession}")
    expect(workspaceRoot).toContain("onOpenSession={handleOpenSubagentSession}")
  })
})
