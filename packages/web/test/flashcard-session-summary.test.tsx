import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FlashcardSessionSummary } from "../src/components/flashcard/flashcard-session-summary"
import type { FlashcardStanding } from "../src/components/flashcard/flashcard-deck-standing"
import type { FlashcardReviewTallyState } from "../src/state/bench-surface-ui-state"

const STANDING: FlashcardStanding = {
  id: "learning-wait",
  eyebrow: "Learning",
  headline: "Back soon",
  detail: "2 cards come back later",
  sessionLine: "2 cards come back later.",
  action: { label: "Practice", mode: "practice" },
  tone: "calm",
}

const EMPTY_TALLY: FlashcardReviewTallyState = {
  reviewed: 0,
  elapsedMs: 0,
  ratings: { again: 0, hard: 0, good: 0, easy: 0 },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
})

async function renderSummary(input: {
  tally: FlashcardReviewTallyState
  onStudyAgain?: () => void
}) {
  await act(async () => {
    root.render(
      <FlashcardSessionSummary
        deckTitle="Capitals"
        tally={input.tally}
        standing={STANDING}
        upNext={[]}
        onStudyAgain={input.onStudyAgain}
        onBackToDeck={() => {}}
        onPractice={() => {}}
        onOpenDeck={() => {}}
      />,
    )
  })
  return container.textContent ?? ""
}

test("a sitting without Study again offers only Back to deck", async () => {
  const text = await renderSummary({
    tally: { reviewed: 3, elapsedMs: 4_000, ratings: { again: 0, hard: 1, good: 2, easy: 0 } },
  })
  expect(text).toContain("3 reviewed in 4s")
  expect(text).toContain("Back to deck")
  expect(text).not.toContain("Study again")
})

test("an empty tally reads as done instead of zero reviewed", async () => {
  const text = await renderSummary({ tally: EMPTY_TALLY, onStudyAgain: () => {} })
  expect(text).toContain("All done for now!")
  expect(text).toContain("Study again")
  expect(text).not.toContain("0 reviewed")
})
