import {
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  type FoliateReaderFlow,
} from "../foliate-reader-types"

export const READER_NAVIGATION_GO_LEFT = "go-left" as const
export const READER_NAVIGATION_GO_RIGHT = "go-right" as const
export const READER_NAVIGATION_PREVIOUS = "previous" as const
export const READER_NAVIGATION_NEXT = "next" as const

export type ReaderNavigationCommand =
  | typeof READER_NAVIGATION_GO_LEFT
  | typeof READER_NAVIGATION_GO_RIGHT
  | typeof READER_NAVIGATION_PREVIOUS
  | typeof READER_NAVIGATION_NEXT

type ResolveReaderArrowNavigationInput = {
  flow: FoliateReaderFlow
  isFixedLayout: boolean
  key: string
}

export function resolveReaderArrowNavigation(
  input: ResolveReaderArrowNavigationInput,
): ReaderNavigationCommand | undefined {
  const usesPageTurns = input.isFixedLayout || input.flow === FLOW_PAGINATED

  if (usesPageTurns && input.key === "ArrowLeft") {
    return READER_NAVIGATION_GO_LEFT
  }
  if (usesPageTurns && input.key === "ArrowRight") {
    return READER_NAVIGATION_GO_RIGHT
  }
  if (!input.isFixedLayout && input.flow === FLOW_SCROLLED && input.key === "ArrowUp") {
    return READER_NAVIGATION_PREVIOUS
  }
  if (!input.isFixedLayout && input.flow === FLOW_SCROLLED && input.key === "ArrowDown") {
    return READER_NAVIGATION_NEXT
  }

  return undefined
}
