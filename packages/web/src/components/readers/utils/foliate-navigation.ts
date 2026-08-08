import { FLOW_PAGINATED, FLOW_SCROLLED, type FoliateReaderFlow } from "../foliate-reader-types"

export const READER_NAVIGATION_GO_LEFT = "go-left" as const
export const READER_NAVIGATION_GO_RIGHT = "go-right" as const
export const READER_NAVIGATION_PREVIOUS = "previous" as const
export const READER_NAVIGATION_NEXT = "next" as const

const SECTION_SCROLL_BOUNDARY_EPSILON_PX = 2

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

type ResolveReaderWheelNavigationInput = {
  flow: FoliateReaderFlow
  isFixedLayout: boolean
  deltaY: number
  sectionStart: number | undefined
  sectionEnd: number | undefined
  sectionSize: number | undefined
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

export function resolveReaderWheelNavigation(
  input: ResolveReaderWheelNavigationInput,
): typeof READER_NAVIGATION_PREVIOUS | typeof READER_NAVIGATION_NEXT | undefined {
  if (input.isFixedLayout || input.flow !== FLOW_SCROLLED || !Number.isFinite(input.deltaY)) {
    return undefined
  }
  if (
    input.sectionStart === undefined ||
    input.sectionEnd === undefined ||
    input.sectionSize === undefined ||
    !Number.isFinite(input.sectionStart) ||
    !Number.isFinite(input.sectionEnd) ||
    !Number.isFinite(input.sectionSize)
  ) {
    return undefined
  }

  if (input.deltaY < 0 && input.sectionStart <= SECTION_SCROLL_BOUNDARY_EPSILON_PX) {
    return READER_NAVIGATION_PREVIOUS
  }
  if (
    input.deltaY > 0 &&
    input.sectionSize - input.sectionEnd <= SECTION_SCROLL_BOUNDARY_EPSILON_PX
  ) {
    return READER_NAVIGATION_NEXT
  }

  return undefined
}
