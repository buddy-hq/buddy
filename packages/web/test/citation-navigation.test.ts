import { afterEach, describe, expect, test } from "bun:test"
import type { Citation } from "@buddy/citation-contract"
import {
  registerCitationNavigationHandler,
  requestCitationNavigation,
  resolveChatCitationTarget,
} from "../src/lib/citations/navigation"

const cleanups: Array<() => void> = []

function citation(id: string): Citation {
  return {
    schemaVersion: 1,
    id,
    excerpt: id,
    source: {
      kind: "chat",
      sessionID: "session",
      messageID: "message",
      partID: "part",
      selector: { version: 1, start: 0, end: id.length, prefix: "", suffix: "" },
    },
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  await requestCitationNavigation(citation("clear-pending-test-state"))
})

describe("citation navigation", () => {
  test("finds quoted text in the message's rendered parts when the saved part ID is missing", () => {
    const container = document.createElement("div")
    const otherMessage = document.createElement("div")
    otherMessage.dataset.citationMessage = "another-message"
    otherMessage.dataset.citationPart = "part"
    otherMessage.textContent = "quoted text"
    const first = document.createElement("div")
    first.dataset.citationMessage = "message"
    first.dataset.citationPart = "projected-first"
    first.textContent = "Before the quote."
    const second = document.createElement("div")
    second.dataset.citationMessage = "message"
    second.dataset.citationPart = "projected-second"
    second.textContent = "The quoted text is here."
    container.append(otherMessage, first, second)
    const input = {
      messageID: "message",
      partID: "part",
      excerpt: "quoted text",
      selector: { version: 1 as const, start: 0, end: 11, prefix: "", suffix: "" },
    }

    const matched = resolveChatCitationTarget(container, input)
    expect(matched?.source).toBe(second)
    expect(matched?.range?.toString()).toBe("quoted text")

    const changed = resolveChatCitationTarget(container, { ...input, excerpt: "removed text" })
    expect(changed?.source).toBe(first)
    expect(changed?.range).toBeUndefined()

    first.remove()
    second.remove()
    expect(resolveChatCitationTarget(container, input)).toBeUndefined()
  })

  test("prefers the saved part ID over an earlier part with the same quoted text", () => {
    const container = document.createElement("div")
    const first = document.createElement("div")
    first.dataset.citationMessage = "message"
    first.dataset.citationPart = "projected-first"
    first.textContent = "quoted text"
    const exact = document.createElement("div")
    exact.dataset.citationMessage = "message"
    exact.dataset.citationPart = "part"
    exact.textContent = "quoted text"
    container.append(first, exact)

    const matched = resolveChatCitationTarget(container, {
      messageID: "message",
      partID: "part",
      excerpt: "quoted text",
      selector: { version: 1, start: 0, end: 11, prefix: "", suffix: "" },
    })
    expect(matched?.source).toBe(exact)
    expect(matched?.range?.toString()).toBe("quoted text")
  })

  test("does not let an older completion clear a newer pending citation", async () => {
    let finishOlder: (() => void) | undefined
    cleanups.push(
      registerCitationNavigationHandler(async (candidate) => {
        if (candidate.id === "older") {
          await new Promise<void>((resolve) => {
            finishOlder = resolve
          })
          return true
        }
        return candidate.id === "newer" ? "pending" : false
      }),
    )

    const olderRequest = requestCitationNavigation(citation("older"))
    await Promise.resolve()
    expect(finishOlder).toBeDefined()
    await expect(requestCitationNavigation(citation("newer"))).resolves.toBe(true)
    finishOlder?.()
    await expect(olderRequest).resolves.toBe(true)

    const mountedCandidates: string[] = []
    cleanups.push(
      registerCitationNavigationHandler((candidate) => {
        mountedCandidates.push(candidate.id)
        return true
      }),
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(mountedCandidates).toEqual(["newer"])
  })

  test("continues to another surface when a navigation handler fails", async () => {
    cleanups.push(registerCitationNavigationHandler(() => true))
    cleanups.push(
      registerCitationNavigationHandler(() => {
        throw new Error("surface failed")
      }),
    )

    await expect(requestCitationNavigation(citation("recoverable"))).resolves.toBe(true)
  })
})
