import { describe, expect, test } from "bun:test"
import { openOwnedSubagentBench, subagentBenchSelection } from "../src/lib/subagent-bench-target"

const SESSIONS = [
  { id: "chat-a" },
  { id: "chat-a-child", parentID: "chat-a" },
  { id: "chat-a-grandchild", parentID: "chat-a-child" },
  { id: "chat-b" },
]

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

  test("loads a missing child and every ancestor before selecting the root", async () => {
    const selected: string[] = []
    const result = await openOwnedSubagentBench({
      directory: "C:\\Notebook",
      sessionID: "chat-a-grandchild",
      sessions: [],
      activeDirectory: "C:\\Notebook",
      activeSessionID: "chat-b",
      loadSession: async (_directory, sessionID) => {
        const session = SESSIONS.find((candidate) => candidate.id === sessionID)
        if (!session) throw new Error("Missing fixture session")
        return session
      },
      selectSession: async (_directory, sessionID) => {
        selected.push(sessionID)
        return true
      },
      openSubagentBench: async (_directory, sessionID) => {
        selected.push(sessionID)
        return true
      },
    })
    expect(result).toBe(true)
    expect(selected).toEqual(["chat-a", "chat-a-grandchild"])
  })

  test("does not replace the owner chat when an ancestor cannot be loaded", async () => {
    const selected: string[] = []
    expect(subagentBenchSelection([{ id: "child", parentID: "missing" }], "child")).toBeUndefined()
    expect(
      await openOwnedSubagentBench({
        directory: "/notebook",
        sessionID: "child",
        sessions: [{ id: "child", parentID: "missing" }],
        activeDirectory: "/notebook",
        activeSessionID: "owner",
        loadSession: async () => {
          throw new Error("Unavailable ancestor")
        },
        selectSession: async (_directory, sessionID) => {
          selected.push(sessionID)
          return true
        },
        openSubagentBench: async () => true,
      }),
    ).toBe(false)
    expect(selected).toEqual([])
  })
})
