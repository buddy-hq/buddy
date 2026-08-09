import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ReviewCardHinge } from "../src/components/flashcard/flashcard-review-card"
import type { ReviewNote } from "../src/components/flashcard/flashcard-review-session"

const NOTE: ReviewNote = {
  noteID: "note-1",
  objectID: "deck-1",
  type: "basic",
  fields: {
    front: "Read the [source](https://example.com)",
    back: "Secret answer",
  },
}

describe("flashcard review card", () => {
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

  test("keeps Markdown controls outside buttons and hides the answer face semantically", async () => {
    await act(async () => {
      root.render(<ReviewCardHinge note={NOTE} templateIdx={0} revealed={false} />)
    })

    expect(container.querySelector("a")?.closest("button")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
    const hiddenFace = Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
    ).find((element) => element.textContent?.includes("Secret answer"))
    expect(hiddenFace).toBeDefined()
    expect(hiddenFace?.inert).toBe(true)
  })
})
