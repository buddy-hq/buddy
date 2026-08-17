import { describe, expect, test } from "bun:test"
import {
  parsePersistableWhiteboardElement,
  WhiteboardObjectStateSchema,
} from "../../src/learning/features/whiteboard/service/types"

/**
 * Regression pins for the anti-slop parse-at-I/O wave (5dbd11bf77).
 *
 * `WhiteboardElementSchema` was `.loose()` with only `id` and `type` required. The wave added
 * typed optional fields, and `.optional()` accepts a missing key but rejects a present `null`.
 * Excalidraw persists `containerId: null` for unbound text and `startBinding`/`endBinding: null`
 * for unbound arrows, so boards written before the wave now fail the read parse in
 * `store.ts readState`, which only swallows ENOENT and rethrows ZodError.
 *
 * These assert the pre-wave contract: a null-valued Excalidraw field must not reject the board.
 */

const boardWithElements = (elements: readonly unknown[]) => ({
  version: 3,
  currentBoard: {
    boardID: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    origin: "learner",
    updatedAt: "2026-08-01T12:00:00.000Z",
    elements,
  },
})

describe("whiteboard element schema tolerates Excalidraw null fields", () => {
  test("accepts unbound text with containerId: null", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([{ id: "text-1", type: "text", x: 10, y: 20, text: "Hello", containerId: null }]),
    )
    expect(result.success).toBe(true)
  })

  test("accepts an unbound arrow with null bindings", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([
        { id: "arrow-1", type: "arrow", x: 0, y: 0, startBinding: null, endBinding: null },
      ]),
    )
    expect(result.success).toBe(true)
  })

  test("accepts an arrow with label: null", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([{ id: "arrow-2", type: "arrow", label: null }]),
    )
    expect(result.success).toBe(true)
  })

  test("a single null-bound element does not reject its sibling elements", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([
        { id: "text-ok", type: "text", text: "kept" },
        { id: "text-null", type: "text", containerId: null },
      ]),
    )
    expect(result.success).toBe(true)
  })

  test("still accepts boards whose elements carry no null fields", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([{ id: "text-1", type: "text", x: 10, y: 20, text: "Hello" }]),
    )
    expect(result.success).toBe(true)
  })

  // The learner save path parses each element twice: once via the request schema, then again via
  // parsePersistableWhiteboardElement. Normalizing null to undefined in the first parse leaves an
  // own key holding undefined, which the JSON record parse in the second one rejects with
  // "must be an object" — so the round trip has to be asserted, not just the first parse.
  test("an unbound text element survives the full save round trip", () => {
    const state = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([
        { id: "text-1", type: "text", x: 10, y: 20, text: "Fixed round-trip text", containerId: null },
      ]),
    )
    expect(state.success).toBe(true)
    if (!state.success) return
    const element = state.data.currentBoard?.elements[0]
    expect(element).toBeDefined()
    if (!element) return
    expect(() => parsePersistableWhiteboardElement(element, 0)).not.toThrow()
  })

  test("an unbound arrow survives the full save round trip", () => {
    const state = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([
        { id: "arrow-1", type: "arrow", x: 0, y: 0, startBinding: null, endBinding: null },
      ]),
    )
    expect(state.success).toBe(true)
    if (!state.success) return
    const element = state.data.currentBoard?.elements[0]
    expect(element).toBeDefined()
    if (!element) return
    expect(() => parsePersistableWhiteboardElement(element, 0)).not.toThrow()
  })

  test("parsePersistableWhiteboardElement accepts a raw null containerId directly", () => {
    expect(() =>
      parsePersistableWhiteboardElement(
        { id: "text-2", type: "text", x: 1, y: 2, text: "hi", containerId: null },
        0,
      ),
    ).not.toThrow()
  })

  test("still rejects an element missing the required id", () => {
    const result = WhiteboardObjectStateSchema.safeParse(
      boardWithElements([{ type: "text", text: "no id" }]),
    )
    expect(result.success).toBe(false)
  })
})
