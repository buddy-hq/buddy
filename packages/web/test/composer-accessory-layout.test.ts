import { describe, expect, test } from "bun:test"

import {
  COMPOSER_ACCESSORY_LAYOUT,
  canAutoRestoreLargeAccessory,
  canRestoreLargeAccessory,
  resolveAccessoryBudgetForComposerHeight,
  resolveComposerAccessoryLayout,
  resolveComposerAccessoryCapacity,
  resolveComposerAccessoryPresentation,
  resolveComposerReplacementHeight,
  resolveLargeAccessoryHeight,
  resolveTodoAccessoryHeight,
  resolveTodoAccessoryPresentation,
} from "../src/components/prompt/composer-accessory-layout"

describe("composer accessory layout", () => {
  test("derives compact mode and a shared accessory budget from the actual pane height", () => {
    const regular = resolveComposerAccessoryLayout({
      paneHeight: 864,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const compact = resolveComposerAccessoryLayout({
      paneHeight: 720,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })

    expect(regular.compact).toBe(false)
    expect(regular.preferredTranscriptReserve).toBeCloseTo(302.4)
    expect(regular.accessoryBudget).toBeCloseTo(399.6)
    expect(compact.compact).toBe(true)
    expect(compact.accessoryBudget).toBeCloseTo(382)
  })

  test("accounts for blocking response surfaces before allocating optional accessories", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 720,
      reservedContentHeight: 200,
      hasBlockingResponseSurface: true,
    })

    expect(layout.accessoryBudget).toBeCloseTo(182)
    expect(layout.hasBlockingResponseSurface).toBe(true)
    expect(resolveLargeAccessoryHeight(layout.accessoryBudget)).toBeUndefined()
    expect(resolveTodoAccessoryPresentation(layout.accessoryBudget)).toBe("expanded")
  })

  test("reserves persistent top content without treating it as a blocking response", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 864,
      reservedContentHeight: 80,
      hasBlockingResponseSurface: false,
    })

    expect(layout.accessoryBudget).toBeCloseTo(319.6)
    expect(layout.hasBlockingResponseSurface).toBe(false)
  })

  test("uses a smaller transcript reserve so compact panes still show the task document", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 360,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })

    expect(layout.preferredTranscriptReserve).toBeCloseTo(100.8)
    expect(layout.accessoryBudget).toBeCloseTo(113.2)
    expect(resolveTodoAccessoryPresentation(layout.accessoryBudget)).toBe("expanded")
    expect(resolveTodoAccessoryHeight(layout.accessoryBudget)).toBeCloseTo(113.2)
  })

  test("resizes the same task document symmetrically in both directions", () => {
    expect(resolveTodoAccessoryHeight(120)).toBe(120)
    expect(resolveTodoAccessoryHeight(220)).toBe(220)
    expect(resolveTodoAccessoryHeight(320)).toBe(320)
    expect(resolveTodoAccessoryHeight(400)).toBe(320)
  })

  test("keeps large accessories closed below their minimum and restores only past hysteresis", () => {
    const { largeAccessory } = COMPOSER_ACCESSORY_LAYOUT

    expect(resolveLargeAccessoryHeight(largeAccessory.minimumExpandedHeightPx - 1)).toBeUndefined()
    expect(resolveLargeAccessoryHeight(largeAccessory.minimumExpandedHeightPx)).toBe(
      largeAccessory.minimumExpandedHeightPx,
    )
    expect(canRestoreLargeAccessory(largeAccessory.restoreHeightPx - 1)).toBe(false)
    expect(canRestoreLargeAccessory(largeAccessory.restoreHeightPx)).toBe(true)
  })

  test("uses real composer growth only for threshold transitions, not host pixel height", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 768,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const stableHostHeight = resolveLargeAccessoryHeight(layout.accessoryBudget)
    const baselineCapacity = resolveComposerAccessoryCapacity(
      resolveAccessoryBudgetForComposerHeight({ layout, composerHeight: 154 }),
    )
    const grownCapacity = resolveComposerAccessoryCapacity(
      resolveAccessoryBudgetForComposerHeight({ layout, composerHeight: 178 }),
    )

    expect(stableHostHeight).toBeCloseTo(337.2)
    expect(baselineCapacity).toBe("expanded")
    expect(grownCapacity).toBe("compact")
    expect(resolveLargeAccessoryHeight(layout.accessoryBudget)).toBe(stableHostHeight)
  })

  test("uses the measured composer budget to constrain the task document", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 720,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const baseline = resolveComposerAccessoryPresentation({
      layout,
      measuredComposerHeight: undefined,
    })
    const grown = resolveComposerAccessoryPresentation({
      layout,
      measuredComposerHeight: 360,
    })
    const exhausted = resolveComposerAccessoryPresentation({
      layout,
      measuredComposerHeight: 500,
    })

    expect(baseline.todoAccessoryHeight).toBe(320)
    expect(grown.accessoryBudget).toBe(160)
    expect(grown.todoAccessoryHeight).toBe(160)
    expect(exhausted.accessoryBudget).toBe(20)
    expect(exhausted.todoPresentation).toBe("hidden")
    expect(exhausted.todoAccessoryHeight).toBeUndefined()
  })

  test("preserves the transcript reserve for composer-replacement inputs", () => {
    const compact = resolveComposerAccessoryLayout({
      paneHeight: 360,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const regular = resolveComposerAccessoryLayout({
      paneHeight: 956,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })

    expect(resolveComposerReplacementHeight(compact)).toBeCloseTo(217.2)
    expect(
      compact.paneHeight -
        resolveComposerReplacementHeight(compact) -
        COMPOSER_ACCESSORY_LAYOUT.accessoryGapPx -
        COMPOSER_ACCESSORY_LAYOUT.composerReplacement.persistentFooterHeightPx,
    ).toBeCloseTo(compact.preferredTranscriptReserve)
    expect(resolveComposerReplacementHeight(regular)).toBe(440)
  })

  test("restores a size-minimized accessory only after real capacity clears hysteresis", () => {
    const layout = resolveComposerAccessoryLayout({
      paneHeight: 840,
      reservedContentHeight: 0,
      hasBlockingResponseSurface: false,
    })
    const heldCapacity = resolveComposerAccessoryCapacity(
      resolveAccessoryBudgetForComposerHeight({ layout, composerHeight: 188 }),
    )
    const restorableCapacity = resolveComposerAccessoryCapacity(
      resolveAccessoryBudgetForComposerHeight({ layout, composerHeight: 170 }),
    )

    expect(heldCapacity).toBe("expanded")
    expect(restorableCapacity).toBe("restorable")
    expect(
      canAutoRestoreLargeAccessory({
        minimizedBySize: true,
        layoutAccessoryBudget: layout.accessoryBudget,
        composerCapacity: heldCapacity,
      }),
    ).toBe(false)
    expect(
      canAutoRestoreLargeAccessory({
        minimizedBySize: true,
        layoutAccessoryBudget: layout.accessoryBudget,
        composerCapacity: restorableCapacity,
      }),
    ).toBe(true)
    expect(
      canAutoRestoreLargeAccessory({
        minimizedBySize: false,
        layoutAccessoryBudget: layout.accessoryBudget,
        composerCapacity: restorableCapacity,
      }),
    ).toBe(false)
  })
})
