import { beforeEach, describe, expect, test } from "bun:test"
import {
  readBenchPresentationPreferences,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
} from "../src/lib/bench-navigation"
import { parsePersistedStoreState } from "./parse-test-values"

beforeEach(() => {
  localStorage.clear()
  useBenchPresentationPreferences.setState({
    workspaceWidthPx: 380,
    benchWidthPx: null,
  })
})

describe("Bench presentation preferences", () => {
  test("persists the requested workspace width without clamping presentation overflow", () => {
    setBenchPresentationWorkspaceWidth(10_000, "drawer")

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(10_000)

    setBenchPresentationWorkspaceWidth(0, "drawer")
    setBenchPresentationWorkspaceWidth(Number.NaN, "drawer")

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(10_000)
  })

  test("keeps an unset width out of storage until the user resizes", () => {
    useBenchPresentationPreferences.setState({ workspaceWidthPx: null })

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBeNull()
    expect(readStoredState()).toEqual({})

    setBenchPresentationWorkspaceWidth(420, "drawer")

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(420)
    expect(readStoredState()).toEqual({ workspaceWidthPx: 420 })
  })

  test("saves a Bench width only when the docked Bench is resized", () => {
    setBenchPresentationWorkspaceWidth(400, "drawer")

    expect(readBenchPresentationPreferences()).toEqual({
      workspaceWidthPx: 400,
      benchWidthPx: null,
    })

    setBenchPresentationWorkspaceWidth(450, "bench")

    expect(readBenchPresentationPreferences()).toEqual({
      workspaceWidthPx: 450,
      benchWidthPx: 450,
    })
    expect(readStoredState()).toEqual({ workspaceWidthPx: 450, benchWidthPx: 450 })
  })
})

describe("Bench presentation preferences migration", () => {
  test("keeps only an earlier width wide enough to have been a Bench width", async () => {
    localStorage.setItem(
      "buddy.bench.presentation.v2",
      JSON.stringify({ state: { workspaceWidthPx: 380 }, version: 2 }),
    )
    await useBenchPresentationPreferences.persist.rehydrate()

    expect(readBenchPresentationPreferences()).toEqual({
      workspaceWidthPx: 380,
      benchWidthPx: null,
    })

    localStorage.setItem(
      "buddy.bench.presentation.v2",
      JSON.stringify({ state: { workspaceWidthPx: 700 }, version: 2 }),
    )
    await useBenchPresentationPreferences.persist.rehydrate()

    expect(readBenchPresentationPreferences()).toEqual({
      workspaceWidthPx: 700,
      benchWidthPx: 700,
    })
  })
})

function readStoredState() {
  return parsePersistedStoreState(localStorage.getItem("buddy.bench.presentation.v2"))
}
