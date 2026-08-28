import { describe, expect, test } from "bun:test"
import { TOOL_LAYOUT_ROLES } from "@buddy/opencode-adapter/tool-presentation"

import {
  estimateUserRowSize,
  isSemanticTimelineTailAddition,
} from "../src/components/chat/chat-transcript"
import {
  PROSE_ROW_ACTION_FOOTER_PX,
  PROSE_ROW_CHARS_PER_LINE_ESTIMATE,
  PROSE_ROW_LINE_HEIGHT_PX,
  TRANSCRIPT_GAP_PX,
  collapsedActivityRowHeightPx,
  proseRowHeightPx,
  transcriptGapClass,
} from "../src/components/chat/transcript-layout"

const EXPECTED_GAPS = [
  ["prose", "prose", 8],
  ["prose", "activity", 12],
  ["prose", "compact-output", 12],
  ["prose", "card-output", 16],
  ["prose", "media-output", 20],
  ["activity", "prose", 12],
  ["activity", "activity", 8],
  ["activity", "compact-output", 12],
  ["activity", "card-output", 16],
  ["activity", "media-output", 20],
  ["compact-output", "prose", 12],
  ["compact-output", "activity", 12],
  ["compact-output", "compact-output", 8],
  ["compact-output", "card-output", 12],
  ["compact-output", "media-output", 16],
  ["card-output", "prose", 16],
  ["card-output", "activity", 16],
  ["card-output", "compact-output", 12],
  ["card-output", "card-output", 12],
  ["card-output", "media-output", 16],
  ["media-output", "prose", 20],
  ["media-output", "activity", 20],
  ["media-output", "compact-output", 16],
  ["media-output", "card-output", 16],
  ["media-output", "media-output", 16],
] as const

describe("transcript layout adjacency", () => {
  test("defines exactly one directional gap for all 25 role pairs", () => {
    const actualPairs = TOOL_LAYOUT_ROLES.flatMap((previous) =>
      TOOL_LAYOUT_ROLES.map((next) => [previous, next, TRANSCRIPT_GAP_PX[previous][next]]),
    )
    expect(JSON.stringify(actualPairs)).toBe(JSON.stringify(EXPECTED_GAPS))
  })

  test.each(EXPECTED_GAPS)("maps %s → %s to %ipx", (previous, next, pixels) => {
    const classByPixels = { 8: "pt-2", 12: "pt-3", 16: "pt-4", 20: "pt-5" } as const
    expect(transcriptGapClass(previous, next)).toBe(classByPixels[pixels])
  })

  test("uses the media-scale gap for the first assistant block", () => {
    expect(transcriptGapClass(undefined, "activity")).toBe("pt-5")
  })
})

describe("collapsed activity row height", () => {
  // These are the sizes the recorded traces measured. The virtual estimate must
  // match them: a correction landing in the same frame as a bottom write leaves
  // the virtualizer and the transcript disagreeing about where the end is.
  test("matches the measured geometry for each preceding role", () => {
    expect(collapsedActivityRowHeightPx(undefined)).toBe(48)
    expect(collapsedActivityRowHeightPx("prose")).toBe(40)
    expect(collapsedActivityRowHeightPx("activity")).toBe(36)
  })
})

describe("prose row estimate", () => {
  // Recorded on every send: the row was appended at VIRTUAL_CHAT_TURN_ESTIMATE_PX
  // (360) and measured 48, so the bottom-follow chased 360px and unwound 312 of
  // it a frame later. 48 / 72 / 96 are what the trace measured for one row as it
  // streamed — captured while the action footer was still reserved, so they are
  // the terminal heights now.
  test("matches the measured geometry of a text part", () => {
    expect(proseRowHeightPx({ previous: "activity", textLength: 0, hasActionFooter: true })).toBe(
      48,
    )
    expect(proseRowHeightPx({ previous: "activity", textLength: 34, hasActionFooter: true })).toBe(
      72,
    )
    expect(proseRowHeightPx({ previous: "activity", textLength: 165, hasActionFooter: true })).toBe(
      96,
    )
  })

  // The footer only exists once the turn is terminal. Reserving it while
  // streaming is what put 36px of empty space above the live activity row.
  test("reserves nothing for a footer a streaming row has not mounted", () => {
    const streaming = proseRowHeightPx({
      previous: "activity",
      textLength: 34,
      hasActionFooter: false,
    })
    const terminal = proseRowHeightPx({
      previous: "activity",
      textLength: 34,
      hasActionFooter: true,
    })

    expect(terminal - streaming).toBe(PROSE_ROW_ACTION_FOOTER_PX)
    expect(proseRowHeightPx({ previous: "activity", textLength: 0, hasActionFooter: false })).toBe(
      TRANSCRIPT_GAP_PX.activity.prose,
    )
  })

  test("grows one line at a time", () => {
    const oneLine = proseRowHeightPx({
      previous: "prose",
      textLength: PROSE_ROW_CHARS_PER_LINE_ESTIMATE,
      hasActionFooter: false,
    })
    const twoLines = proseRowHeightPx({
      previous: "prose",
      textLength: PROSE_ROW_CHARS_PER_LINE_ESTIMATE + 1,
      hasActionFooter: false,
    })
    expect(twoLines - oneLine).toBe(PROSE_ROW_LINE_HEIGHT_PX)
  })
})

describe("user row estimate", () => {
  // The steered user row enters mid-stream and is corrected in the same frame as
  // the write that revealed it, so an overshoot is a visible jolt on the row the
  // user is looking at. A recorded steer entered at 144px and measured 88px.
  test("estimates a one-line message at its measured height", () => {
    expect(
      estimateUserRowSize({
        type: "user",
        key: "user:msg",
        userMessageID: "msg",
        partIDs: ["prt_text"],
        textLength: 26,
        stackedContentCount: 0,
        anchor: true,
      }),
    ).toBe(88)
  })

  test("does not treat extra parts as extra lines", () => {
    const oneLineTwoTextParts = estimateUserRowSize({
      type: "user",
      key: "user:msg",
      userMessageID: "msg",
      partIDs: ["prt_a", "prt_b"],
      textLength: 26,
      stackedContentCount: 0,
      anchor: true,
    })

    expect(oneLineTwoTextParts).toBe(88)
  })

  test("reserves stacked space for non-text parts", () => {
    const withAttachment = estimateUserRowSize({
      type: "user",
      key: "user:msg",
      userMessageID: "msg",
      partIDs: ["prt_text", "prt_file"],
      textLength: 26,
      stackedContentCount: 1,
      anchor: true,
    })

    expect(withAttachment).toBeGreaterThan(88)
  })
})

describe("semantic timeline tail addition", () => {
  test("recognizes append and replacement without treating removal as addition", () => {
    expect(
      isSemanticTimelineTailAddition(
        { lastRowKey: "row-a", rowCount: 1 },
        { lastRowKey: "row-b", rowCount: 2 },
      ),
    ).toBe(true)
    expect(
      isSemanticTimelineTailAddition(
        { lastRowKey: "row-a", rowCount: 1 },
        { lastRowKey: "row-b", rowCount: 1 },
      ),
    ).toBe(true)
    expect(
      isSemanticTimelineTailAddition(
        { lastRowKey: "row-b", rowCount: 2 },
        { lastRowKey: "row-a", rowCount: 1 },
      ),
    ).toBe(false)
  })
})
