import { describe, expect, test } from "bun:test"
import { getSessionFamily } from "../../../src/lib/session-family"

describe("session family parity", () => {
  test("returns root followed by child sessions for an active child", () => {
    const family = getSessionFamily(
      [
        {
          id: "session-root",
          title: "Root chat",
          time: { created: 1, updated: 5 },
        },
        {
          id: "session-child-2",
          title: "Second child",
          parentID: "session-root",
          time: { created: 3, updated: 4 },
        },
        {
          id: "session-child-1",
          title: "First child",
          parentID: "session-root",
          time: { created: 2, updated: 3 },
        },
      ],
      "session-child-2",
    )

    expect(family.current?.id).toBe("session-child-2")
    expect(family.root?.id).toBe("session-root")
    expect(family.family.map((session) => session.id)).toEqual([
      "session-root",
      "session-child-1",
      "session-child-2",
    ])
  })

  test("returns an empty family when the session is missing", () => {
    const family = getSessionFamily([], "session-root")
    expect(family.current).toBeUndefined()
    expect(family.family).toEqual([])
  })

  test("walks to the top root and keeps nested descendants in the same family", () => {
    const family = getSessionFamily(
      [
        {
          id: "session-root",
          title: "Root chat",
          time: { created: 1, updated: 8 },
        },
        {
          id: "session-child",
          title: "Child session",
          parentID: "session-root",
          time: { created: 2, updated: 7 },
        },
        {
          id: "session-grandchild",
          title: "Grandchild session",
          parentID: "session-child",
          time: { created: 3, updated: 6 },
        },
        {
          id: "session-great-grandchild",
          title: "Great grandchild session",
          parentID: "session-grandchild",
          time: { created: 4, updated: 5 },
        },
      ],
      "session-great-grandchild",
    )

    expect(family.root?.id).toBe("session-root")
    expect(family.family.map((session) => session.id)).toEqual([
      "session-root",
      "session-child",
      "session-grandchild",
      "session-great-grandchild",
    ])
  })
})
