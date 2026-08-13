import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ClozeMarkdown } from "../src/components/flashcard/flashcard-cloze-markdown"
import { FlashcardDeckView } from "../src/components/flashcard/flashcard-deck-view"
import { resetMarkdownWorkerForTests } from "../src/components/markdown/markdown-worker"
import type { FlashcardStanding } from "../src/components/flashcard/flashcard-deck-standing"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

const RENDER_WAIT_ATTEMPTS = 200
const RENDER_WAIT_DELAY_MS = 10

async function flushEffects(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < RENDER_WAIT_ATTEMPTS; attempt += 1) {
    await flushEffects()
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, RENDER_WAIT_DELAY_MS))
  }
  throw new Error("Timed out waiting for cloze Markdown to render")
}

const CLOZE_MARKDOWN = [
  "## Prompt",
  "",
  "Use **formatting**, `inline {{c1::value}}`, {{c1::**rich answer**}}, and {{c2::**another answer**}}.",
  "",
  "```ts",
  'const result = "{{c1::secret}}"',
  "```",
].join("\n")

const DECK = {
  objectID: "deck-markdown",
  kind: "flashcard-deck",
  title: "Markdown deck",
  config: {},
  notes: [
    {
      noteID: "note-cloze",
      objectID: "deck-markdown",
      type: "cloze",
      fields: { text: CLOZE_MARKDOWN },
    },
  ],
  cards: [
    {
      cardID: "card-cloze",
      noteID: "note-cloze",
      templateIdx: 0,
      state: "new",
      due: 0,
      interval: 0,
      easeFactor: 2500,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    },
  ],
  createdAt: "2026-08-14T00:00:00.000Z",
  createdBy: {
    kind: "tool",
    sessionID: "session-markdown",
    messageID: "message-markdown",
    callID: "call-markdown",
    subagent: "flashcard-author",
  },
} satisfies ObjectFlashcardDeckReadDeckResponse

const QUEUE = {
  queuedCardIDs: ["card-cloze"],
  cards: [],
  queueLease: null,
  newCount: 1,
  learningCount: 0,
  reviewCount: 0,
  resolvedConfig: { newPerDay: 20, reviewsPerDay: 200, leechThreshold: 8 },
  completion: {
    nextLearningAt: null,
    nextDueAt: null,
    nextQueueAt: null,
    newLimitReached: false,
    reviewLimitReached: false,
    newHeldBack: 0,
    reviewHeldBack: 0,
    learningLaterToday: 0,
    returningLater: 0,
    reviewedToday: { newCount: 0, reviewCount: 0 },
  },
} satisfies ObjectFlashcardDeckQueuedCardsResponse

const STANDING = {
  id: "fresh",
  eyebrow: "New deck",
  headline: "Ready",
  detail: "Markdown rendering test",
  sessionLine: "Ready",
  action: { label: "Study", mode: "study" },
  tone: "ready",
} satisfies FlashcardStanding

describe("flashcard cloze Markdown", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    resetMarkdownWorkerForTests()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders Markdown and answer-width blanks in prose and highlighted code", async () => {
    await act(async () => {
      root.render(<ClozeMarkdown text={CLOZE_MARKDOWN} ordinal={1} revealed={false} />)
    })
    await act(async () => {
      await waitFor(
        () => container.querySelectorAll('[data-cloze-state="hidden"]').length === 3,
      )
    })

    const blanks = container.querySelectorAll<HTMLElement>('[data-cloze-state="hidden"]')
    expect(blanks).toHaveLength(3)
    expect(blanks[0]?.textContent).toBe("value")
    expect(blanks[1]?.textContent).toBe("rich answer")
    expect(blanks[1]?.querySelector("strong")?.textContent).toBe("rich answer")
    expect(blanks[2]?.textContent).toBe("secret")
    expect(Array.from(blanks).every((blank) => blank.querySelector(".invisible"))).toBe(true)
    expect(container.querySelector("h2")?.textContent).toBe("Prompt")
    expect(container.querySelector("strong")?.textContent).toBe("formatting")
    expect(container.querySelector("pre code")?.textContent).toContain("secret")
    expect(container.querySelector('[data-slot="markdown-copy-button"]')).not.toBeNull()
    expect(container.textContent).not.toContain("{{c1::")
  })

  test("reveals target clozes and renders Markdown inside non-target clozes", async () => {
    await act(async () => {
      root.render(<ClozeMarkdown text={CLOZE_MARKDOWN} ordinal={1} revealed />)
    })
    await act(async () => {
      await waitFor(
        () => container.querySelectorAll('[data-cloze-state="revealed"]').length === 3,
      )
    })

    const answers = container.querySelectorAll<HTMLElement>('[data-cloze-state="revealed"]')
    expect(answers).toHaveLength(3)
    expect(Array.from(answers).every((answer) => answer.querySelector(".invisible") === null)).toBe(
      true,
    )
    expect(Array.from(container.querySelectorAll("strong")).map((element) => element.textContent)).toEqual([
      "formatting",
      "rich answer",
      "another answer",
    ])
  })

  test("preserves block Markdown inside a line-isolated cloze", async () => {
    const blockCloze = "{{c1::## Heading\n\nBody with **strong text**.}}"
    await act(async () => {
      root.render(<ClozeMarkdown text={blockCloze} ordinal={1} revealed={false} />)
    })
    await act(async () => {
      await waitFor(() => container.querySelector('[data-cloze-state="hidden"]') !== null)
    })

    const blank = container.querySelector<HTMLElement>('[data-cloze-state="hidden"]')
    expect(blank?.tagName).toBe("DIV")
    expect(blank?.querySelector("h2")?.textContent).toBe("Heading")
    expect(blank?.querySelector("p")?.textContent).toBe("Body with strong text.")
    expect(blank?.querySelector("strong")?.textContent).toBe("strong text")
    expect(blank?.querySelector(".invisible")).not.toBeNull()
    expect(container.querySelector("span h2")).toBeNull()
    expect(
      Array.from(container.querySelectorAll("p")).some(
        (paragraph) => paragraph.textContent?.trim() === "",
      ),
    ).toBe(false)
  })

  test("renders cloze Markdown instead of raw source in the collapsed deck list", async () => {
    await act(async () => {
      root.render(
        <FlashcardDeckView
          deck={DECK}
          queue={QUEUE}
          standing={STANDING}
          peekCardID={undefined}
          onPeek={() => undefined}
          onAction={() => undefined}
        />,
      )
    })
    await act(async () => {
      await waitFor(() => container.querySelector('[data-cloze-state="hidden"]') !== null)
    })

    const rowToggle = container.querySelector<HTMLButtonElement>(
      'button[data-action="flashcard-deck-row-toggle"][aria-expanded="false"]',
    )
    const viewport = container.querySelector<HTMLElement>('[data-component="flashcard-deck-view"]')
    const row = rowToggle?.parentElement
    const front = row?.querySelector<HTMLElement>("[data-markdown-document]")
    expect(viewport?.className).toContain("absolute inset-0")
    expect(viewport?.className).toContain("overflow-y-auto")
    expect(front?.className).toContain("max-h-[2lh]")
    expect(front?.className).toContain("overflow-hidden")
    expect(front?.className).not.toContain("line-clamp-2")
    expect(row?.querySelector("strong")?.textContent).toBe("formatting")
    expect(row?.querySelector("pre code")?.textContent).toContain("secret")
    expect(row?.textContent).not.toContain("{{c1::")
    const copyButton = row?.querySelector('[data-slot="markdown-copy-button"]')
    expect(copyButton?.parentElement?.closest("button")).toBeNull()
    expect(rowToggle?.contains(copyButton ?? null)).toBe(false)
  })
})
