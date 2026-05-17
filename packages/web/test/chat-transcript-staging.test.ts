import { describe, expect, test } from "bun:test"

import {
  estimateOmittedTurnsHeight,
  getInitialStagedTurnCount,
  sliceStagedTurns,
  shouldStageTranscriptEntry,
} from "../src/components/chat/transcript-staging"
import type { ChatTurn } from "../src/components/chat/types"
import {
  VIRTUAL_CHAT_STAGE_INITIAL_TURNS,
  VIRTUAL_CHAT_STAGE_MIN_OMITTED_HEIGHT_PX,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "../src/components/virtualization/virtualization-defaults"

function createTurn(index: number): ChatTurn {
  return {
    key: `turn:${index}`,
    assistants: [],
  }
}

describe("chat transcript staging", () => {
  test("stages transcript entry when it exceeds the initial tail window", () => {
    const turnCount =
      VIRTUAL_CHAT_STAGE_INITIAL_TURNS +
      Math.ceil(VIRTUAL_CHAT_STAGE_MIN_OMITTED_HEIGHT_PX / VIRTUAL_CHAT_TURN_ESTIMATE_PX)

    expect(
      shouldStageTranscriptEntry({
        turns: Array.from({ length: turnCount }, (_, index) => createTurn(index)),
      }),
    ).toBe(true)
  })

  test("does not stage transcript entry for short transcripts even when turns exceed the tail window", () => {
    expect(
      shouldStageTranscriptEntry({
        turns: Array.from({ length: VIRTUAL_CHAT_STAGE_INITIAL_TURNS + 1 }, (_, index) =>
          createTurn(index),
        ),
      }),
    ).toBe(false)
  })

  test("renders the tail immediately for a staged session switch", () => {
    const turns = Array.from(
      {
        length:
          VIRTUAL_CHAT_STAGE_INITIAL_TURNS +
          Math.ceil(VIRTUAL_CHAT_STAGE_MIN_OMITTED_HEIGHT_PX / VIRTUAL_CHAT_TURN_ESTIMATE_PX),
      },
      (_, index) => createTurn(index),
    )

    expect(
      getInitialStagedTurnCount({
        sessionID: "ses_tail",
        turns,
      }),
    ).toBe(VIRTUAL_CHAT_STAGE_INITIAL_TURNS)
  })

  test("renders the full transcript immediately when omitted height stays small", () => {
    const turns = Array.from({ length: VIRTUAL_CHAT_STAGE_INITIAL_TURNS + 1 }, (_, index) =>
      createTurn(index),
    )

    expect(
      getInitialStagedTurnCount({
        sessionID: "ses_short",
        turns,
      }),
    ).toBe(turns.length)
  })

  test("slices staged turns from the tail", () => {
    const turns = Array.from({ length: 6 }, (_, index) => createTurn(index))
    const staged = sliceStagedTurns(turns, 2)

    expect(staged.renderedStartIndex).toBe(4)
    expect(staged.renderedTurns.map((turn) => turn.key)).toEqual(["turn:4", "turn:5"])
  })

  test("reserves estimated height for omitted turns", () => {
    const turns = Array.from({ length: 5 }, (_, index) => createTurn(index))

    expect(estimateOmittedTurnsHeight(turns, 3)).toBe(VIRTUAL_CHAT_TURN_ESTIMATE_PX * 3)
  })
})
