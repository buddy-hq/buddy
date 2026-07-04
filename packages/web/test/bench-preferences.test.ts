import { beforeEach, describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  benchModePreferenceKey,
  finalizeBenchModeTransition,
  readBenchPresentationPreferences,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
  type BenchMode,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import {
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type DirectoryWorkspaceCommandResult,
} from "../src/state/directory-workspace-store"

const TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget

function transitionResult(
  outcome: DirectoryWorkspaceCommandResult["outcome"],
  mode: BenchMode = BENCH_CHAT_LAYOUT_FLOATING,
): Pick<DirectoryWorkspaceCommandResult, "outcome" | "projection"> {
  return {
    outcome,
    projection: effectiveWorkspaceProjection(
      { status: "open", target: TARGET, mode },
      {
        docked: createExpandedWorkspaceState(null),
        lastDrawer: "files",
      },
      null,
    ),
  }
}

beforeEach(() => {
  localStorage.clear()
  useBenchPresentationPreferences.setState({
    modeBySurface: {},
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

  test("updates mode preference only after the requested transition commits", () => {
    const preferenceKey = benchModePreferenceKey(TARGET)
    const uncommittedOutcomes: DirectoryWorkspaceCommandResult["outcome"][] = [
      "failed",
      "superseded",
      "inactive",
      "blocked",
    ]

    for (const outcome of uncommittedOutcomes) {
      expect(
        finalizeBenchModeTransition({
          target: TARGET,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
          persistPreference: true,
          result: transitionResult(outcome),
        }),
      ).toBe(false)
    }
    expect(readBenchPresentationPreferences().modeBySurface[preferenceKey]).toBeUndefined()

    expect(
      finalizeBenchModeTransition({
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_FLOATING,
        persistPreference: true,
        result: transitionResult("committed", BENCH_CHAT_LAYOUT_DOCKED),
      }),
    ).toBe(false)
    expect(readBenchPresentationPreferences().modeBySurface[preferenceKey]).toBeUndefined()

    expect(
      finalizeBenchModeTransition({
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_FLOATING,
        persistPreference: true,
        result: transitionResult("committed"),
      }),
    ).toBe(true)
    expect(readBenchPresentationPreferences().modeBySurface[preferenceKey]).toBe(
      BENCH_CHAT_LAYOUT_FLOATING,
    )
  })
})
