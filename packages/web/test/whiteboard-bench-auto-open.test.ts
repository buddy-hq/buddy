import { describe, expect, test } from "bun:test"
import type { ObjectWhiteboardSessionReadResponse } from "@buddy/sdk/types"
import { BENCH_AUTO_OPEN_POLICY_WHITEBOARD, type BenchTarget } from "../src/lib/bench-navigation"
import {
  shouldStartWhiteboardBenchAutoOpen,
  whiteboardBenchAutoOpenIdentity,
  whiteboardBenchTargetFromSession,
} from "../src/components/whiteboard/whiteboard-bench-auto-open"

const ACTIVE_TOOL_KEY = "message-1:part-1"
const SESSION_ID = "session-1"

describe("whiteboard Bench auto-open", () => {
  test("starts once for an active whiteboard tool key", () => {
    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set(),
        inFlightToolKey: undefined,
      }),
    ).toBe(true)

    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set([ACTIVE_TOOL_KEY]),
        inFlightToolKey: undefined,
      }),
    ).toBe(false)

    expect(
      shouldStartWhiteboardBenchAutoOpen({
        activeToolKey: ACTIVE_TOOL_KEY,
        sessionID: SESSION_ID,
        handledToolKeys: new Set(),
        inFlightToolKey: ACTIVE_TOOL_KEY,
      }),
    ).toBe(false)
  })

  test("builds the current whiteboard Bench target from the session object", () => {
    const session = {
      objectID: "whiteboard-object-1",
      currentBoard: null,
    } satisfies ObjectWhiteboardSessionReadResponse
    const target = {
      type: "object",
      ref: {
        kind: "whiteboard",
        objectID: "whiteboard-object-1",
        revisionID: null,
        itemID: null,
      },
      viewID: "current",
    } satisfies BenchTarget

    expect(whiteboardBenchTargetFromSession(session)).toEqual(target)
    expect(whiteboardBenchAutoOpenIdentity(ACTIVE_TOOL_KEY)).toEqual({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: ACTIVE_TOOL_KEY,
    })
  })

  test("does not build a target before a session object exists", () => {
    const session = {
      objectID: null,
      currentBoard: null,
    } satisfies ObjectWhiteboardSessionReadResponse

    expect(whiteboardBenchTargetFromSession(session)).toBeUndefined()
  })
})
