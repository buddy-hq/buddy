import { beforeEach, describe, expect, test } from "bun:test"
import {
  readBenchPresentationPreferences,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
} from "../src/lib/bench-navigation"

beforeEach(() => {
  localStorage.clear()
  useBenchPresentationPreferences.setState({
    workspaceWidthPx: 380,
  })
})

describe("Bench presentation preferences", () => {
  test("reuses one persisted workspace width across notebooks", () => {
    setBenchPresentationWorkspaceWidth(736)

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(736)
    expect(useBenchPresentationPreferences.getState().workspaceWidthPx).toBe(736)
  })

  test("persists the requested workspace width without clamping presentation overflow", () => {
    setBenchPresentationWorkspaceWidth(10_000)

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(10_000)

    setBenchPresentationWorkspaceWidth(0)
    setBenchPresentationWorkspaceWidth(Number.NaN)

    expect(readBenchPresentationPreferences().workspaceWidthPx).toBe(10_000)
  })
})
