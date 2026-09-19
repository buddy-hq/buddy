import { afterEach, describe, expect, test } from "bun:test"
import type { Citation } from "@buddy/citation-contract"
import {
  registerCitationNavigationHandler,
  requestCitationNavigation,
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
