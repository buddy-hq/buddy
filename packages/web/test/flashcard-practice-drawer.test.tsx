import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Layers3Icon } from "../src/icons/app-icons"
import { FlashcardPracticeDrawerRow } from "../src/components/flashcard/flashcard-practice-drawer"
import { practiceReturnLabel } from "../src/components/directory-chat/right-workspace-catalog-drawers"
import { FlashcardPracticeStage } from "../src/components/flashcard/flashcard-practice-stage"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

const RETURN_LABEL_NOW = Date.UTC(2026, 7, 9, 12)
const RETURN_LABEL_DAY_MS = 86_400_000

function createDeferredQueue(
  nextDueAt: number,
  nextQueueAt: number,
): ObjectFlashcardDeckQueuedCardsResponse {
  return {
    queuedCardIDs: [],
    cards: [],
    queueLease: null,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    resolvedConfig: { newPerDay: 20, reviewsPerDay: 200, leechThreshold: 8 },
    completion: {
      nextLearningAt: null,
      nextDueAt,
      nextQueueAt,
      newLimitReached: false,
      reviewLimitReached: false,
      newHeldBack: 0,
      reviewHeldBack: 0,
      learningLaterToday: 0,
      returningLater: 1,
      reviewedToday: { newCount: 0, reviewCount: 0 },
    },
  }
}

function createEmptyDeck(): ObjectFlashcardDeckReadDeckResponse {
  return {
    objectID: "deck-empty",
    kind: "flashcard-deck",
    title: "Empty deck",
    config: {},
    notes: [],
    cards: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: { kind: "app", reason: "test" },
  }
}

describe("flashcard Practice drawer", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps open and study as separate Easel row targets", async () => {
    const onOpen = mock(() => undefined)
    const onStudy = mock(() => undefined)

    await act(async () => {
      root.render(
        <FlashcardPracticeDrawerRow
          icon={Layers3Icon}
          title="Western education"
          metadata="24 cards"
          action={{ kind: "action", label: "Study 12", onClick: onStudy }}
          onOpen={onOpen}
        />,
      )
    })

    const row = container.querySelector<HTMLElement>('[data-component="practice-drawer-row"]')
    const buttons = row?.querySelectorAll<HTMLButtonElement>("button")
    expect(row?.className).toContain("border-b")
    expect(buttons?.length).toBe(2)
    expect(buttons?.item(1).style.width).toBe("104px")

    await act(async () => buttons?.item(0).click())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onStudy).toHaveBeenCalledTimes(0)

    await act(async () => buttons?.item(1).click())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onStudy).toHaveBeenCalledTimes(1)
  })

  test("keeps the fixed Next column when a deck has no action", async () => {
    await act(async () => {
      root.render(
        <FlashcardPracticeDrawerRow
          icon={Layers3Icon}
          title="Learning theories"
          metadata="32 cards"
          action={{ kind: "note", label: "tomorrow" }}
          onOpen={() => undefined}
        />,
      )
    })

    const row = container.querySelector<HTMLElement>('[data-component="practice-drawer-row"]')
    expect(row?.querySelectorAll("button").length).toBe(1)
    expect(row?.lastElementChild?.getAttribute("style")).toContain("width: 104px")
    expect(row?.textContent).toContain("tomorrow")
  })

  test("labels the actual future due date instead of the earlier refresh deadline", () => {
    const nextDueAt = RETURN_LABEL_NOW + 30 * RETURN_LABEL_DAY_MS
    const nextQueueAt = RETURN_LABEL_NOW + RETURN_LABEL_DAY_MS
    const expected = new Date(nextDueAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })

    expect(practiceReturnLabel(createDeferredQueue(nextDueAt, nextQueueAt), RETURN_LABEL_NOW)).toBe(
      expected,
    )
  })

  test("keeps the deck exit available when practice has no cards", async () => {
    const onExit = mock(() => undefined)

    await act(async () => {
      root.render(
        <FlashcardPracticeStage
          deck={createEmptyDeck()}
          index={0}
          revealed={false}
          onIndex={() => undefined}
          onRevealed={() => undefined}
          onExit={onExit}
        />,
      )
    })

    const exit = container.querySelector<HTMLButtonElement>("button")
    expect(container.textContent).toContain("Empty deck")
    expect(container.textContent).toContain("No cards")
    await act(async () => exit?.click())
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
