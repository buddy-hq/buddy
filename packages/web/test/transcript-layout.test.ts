import { describe, expect, test } from "bun:test"
import { TOOL_LAYOUT_ROLES } from "@buddy/opencode-adapter/tool-presentation"

import {
  TRANSCRIPT_GAP_PX,
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
