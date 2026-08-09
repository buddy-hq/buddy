import { describe, expect, test } from "bun:test"
import { BuddyObjectNotFoundError, BuddyObjectUnavailableError } from "../../src/objects"
import { mapWhiteboardObjectRouteError } from "../../src/routes/object-whiteboard"

describe("whiteboard object route errors", () => {
  test("maps a missing object to HTTP 404", () => {
    const response = mapWhiteboardObjectRouteError(
      new BuddyObjectNotFoundError("01J00000000000000000000001"),
    )

    expect(response?.status).toBe(404)
  })

  test("maps an unavailable object to HTTP 410", () => {
    const response = mapWhiteboardObjectRouteError(
      new BuddyObjectUnavailableError("01J00000000000000000000001"),
    )

    expect(response?.status).toBe(410)
  })
})
