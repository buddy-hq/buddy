import {
  VIRTUAL_CHAT_STAGE_INITIAL_TURNS,
  VIRTUAL_CHAT_STAGE_MIN_OMITTED_HEIGHT_PX,
} from "@/components/virtualization/virtualization-defaults"

import { estimateTurnHeight } from "./utils/message-utils"
import type { ChatTurn } from "./types"

export function shouldStageTranscriptEntry(input: {
  turns: ChatTurn[]
}) {
  if (input.turns.length <= VIRTUAL_CHAT_STAGE_INITIAL_TURNS) {
    return false
  }

  const renderedStartIndex = Math.max(0, input.turns.length - VIRTUAL_CHAT_STAGE_INITIAL_TURNS)
  return (
    estimateOmittedTurnsHeight(input.turns, renderedStartIndex) >=
    VIRTUAL_CHAT_STAGE_MIN_OMITTED_HEIGHT_PX
  )
}

export function getInitialStagedTurnCount(input: {
  sessionID: string | undefined
  turns: ChatTurn[]
}) {
  if (!input.sessionID || !shouldStageTranscriptEntry({ turns: input.turns })) {
    return input.turns.length
  }

  return Math.min(input.turns.length, VIRTUAL_CHAT_STAGE_INITIAL_TURNS)
}

export function sliceStagedTurns(turns: ChatTurn[], stagedCount: number | undefined) {
  if (stagedCount === undefined || stagedCount >= turns.length) {
    return {
      renderedTurns: turns,
      renderedStartIndex: 0,
    }
  }

  const safeCount = Math.max(0, stagedCount)
  const renderedStartIndex = Math.max(0, turns.length - safeCount)

  return {
    renderedTurns: turns.slice(renderedStartIndex),
    renderedStartIndex,
  }
}

export function estimateOmittedTurnsHeight(turns: ChatTurn[], renderedStartIndex: number) {
  if (renderedStartIndex <= 0) return 0

  return turns
    .slice(0, renderedStartIndex)
    .reduce((total, turn) => total + estimateTurnHeight(turn), 0)
}
