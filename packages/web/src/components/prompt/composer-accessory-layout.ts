export const COMPOSER_ACCESSORY_LAYOUT = {
  compactPaneHeightPx: 768,
  regularComposerHeightPx: 154,
  compactComposerHeightPx: 138,
  transcriptReserve: {
    regular: {
      minimumPx: 192,
      preferredPaneFraction: 0.35,
      maximumPx: 352,
    },
    compact: {
      minimumPx: 96,
      preferredPaneFraction: 0.28,
      maximumPx: 192,
    },
  },
  accessoryGapPx: 8,
  task: {
    minimumDocumentHeightPx: 96,
    maximumHeightPx: 320,
  },
  largeAccessory: {
    minimumExpandedHeightPx: 320,
    maximumHeightPx: 440,
    restoreHeightPx: 368,
  },
  composerReplacement: {
    maximumHeightPx: 440,
    persistentFooterHeightPx: 34,
  },
} as const

export type ComposerAccessoryLayoutInput = {
  paneHeight: number
  reservedContentHeight: number
  hasBlockingResponseSurface: boolean
}

export type ComposerAccessoryLayout = {
  compact: boolean
  paneHeight: number
  reservedContentHeight: number
  hasBlockingResponseSurface: boolean
  preferredTranscriptReserve: number
  accessoryBudget: number
}

export type TodoAccessoryPresentation = "hidden" | "expanded"
export type ComposerAccessoryCapacity = "hidden" | "compact" | "expanded" | "restorable"

export type ComposerAccessoryPresentation = {
  accessoryBudget: number | undefined
  capacity: ComposerAccessoryCapacity
  largeAccessoryHeight: number | undefined
  todoPresentation: TodoAccessoryPresentation
  todoAccessoryHeight: number | undefined
}

function clampNumber(input: { value: number; minimum: number; maximum: number }): number {
  return Math.min(input.maximum, Math.max(input.minimum, input.value))
}

function nonNegative(value: number): number {
  return Math.max(0, value)
}

export function resolveComposerAccessoryLayout(
  input: ComposerAccessoryLayoutInput,
): ComposerAccessoryLayout {
  const paneHeight = nonNegative(input.paneHeight)
  const reservedContentHeight = nonNegative(input.reservedContentHeight)
  const compact = paneHeight < COMPOSER_ACCESSORY_LAYOUT.compactPaneHeightPx
  const composerHeight = compact
    ? COMPOSER_ACCESSORY_LAYOUT.compactComposerHeightPx
    : COMPOSER_ACCESSORY_LAYOUT.regularComposerHeightPx
  const transcriptReserve = compact
    ? COMPOSER_ACCESSORY_LAYOUT.transcriptReserve.compact
    : COMPOSER_ACCESSORY_LAYOUT.transcriptReserve.regular
  const preferredTranscriptReserve = clampNumber({
    value: paneHeight * transcriptReserve.preferredPaneFraction,
    minimum: transcriptReserve.minimumPx,
    maximum: transcriptReserve.maximumPx,
  })
  const remainingAfterRequiredUI = nonNegative(
    paneHeight - composerHeight - reservedContentHeight,
  )
  const remainingAfterGap = nonNegative(
    remainingAfterRequiredUI - COMPOSER_ACCESSORY_LAYOUT.accessoryGapPx,
  )

  return {
    compact,
    paneHeight,
    reservedContentHeight,
    hasBlockingResponseSurface: input.hasBlockingResponseSurface,
    preferredTranscriptReserve,
    accessoryBudget: nonNegative(remainingAfterGap - preferredTranscriptReserve),
  }
}

export function resolveAccessoryBudgetForComposerHeight(input: {
  layout: ComposerAccessoryLayout
  composerHeight: number
}): number {
  return nonNegative(
    input.layout.paneHeight -
      input.layout.reservedContentHeight -
      nonNegative(input.composerHeight) -
      COMPOSER_ACCESSORY_LAYOUT.accessoryGapPx -
      input.layout.preferredTranscriptReserve,
  )
}

export function resolveComposerAccessoryPresentation(input: {
  layout: ComposerAccessoryLayout | undefined
  measuredComposerHeight: number | undefined
}): ComposerAccessoryPresentation {
  const layout = input.layout
  if (!layout || layout.paneHeight <= 0) {
    return {
      accessoryBudget: undefined,
      capacity: "restorable",
      largeAccessoryHeight: COMPOSER_ACCESSORY_LAYOUT.largeAccessory.maximumHeightPx,
      todoPresentation: "expanded",
      todoAccessoryHeight: COMPOSER_ACCESSORY_LAYOUT.task.maximumHeightPx,
    }
  }

  const accessoryBudget =
    input.measuredComposerHeight === undefined
      ? layout.accessoryBudget
      : resolveAccessoryBudgetForComposerHeight({
          layout,
          composerHeight: input.measuredComposerHeight,
        })
  const capacity = resolveComposerAccessoryCapacity(accessoryBudget)

  return {
    accessoryBudget,
    capacity,
    largeAccessoryHeight: capacityAllowsLargeAccessory(capacity)
      ? resolveLargeAccessoryHeight(layout.accessoryBudget)
      : undefined,
    todoPresentation: resolveTodoAccessoryPresentation(accessoryBudget),
    todoAccessoryHeight: resolveTodoAccessoryHeight(accessoryBudget),
  }
}

export function resolveComposerAccessoryCapacity(
  accessoryBudget: number,
): ComposerAccessoryCapacity {
  if (accessoryBudget < COMPOSER_ACCESSORY_LAYOUT.task.minimumDocumentHeightPx) {
    return "hidden"
  }
  if (accessoryBudget < COMPOSER_ACCESSORY_LAYOUT.largeAccessory.minimumExpandedHeightPx) {
    return "compact"
  }
  if (accessoryBudget < COMPOSER_ACCESSORY_LAYOUT.largeAccessory.restoreHeightPx) {
    return "expanded"
  }
  return "restorable"
}

export function capacityAllowsLargeAccessory(capacity: ComposerAccessoryCapacity): boolean {
  return capacity === "expanded" || capacity === "restorable"
}

export function capacityAllowsLargeAccessoryRestore(
  capacity: ComposerAccessoryCapacity,
): boolean {
  return capacity === "restorable"
}

export function todoPresentationForCapacity(
  capacity: ComposerAccessoryCapacity,
): TodoAccessoryPresentation {
  if (capacity === "hidden") return "hidden"
  return "expanded"
}

export function mostConstrainedTodoPresentation(
  first: TodoAccessoryPresentation,
  second: TodoAccessoryPresentation,
): TodoAccessoryPresentation {
  const priority: Record<TodoAccessoryPresentation, number> = {
    hidden: 0,
    expanded: 1,
  }
  return priority[first] <= priority[second] ? first : second
}

export function resolveLargeAccessoryHeight(accessoryBudget: number): number | undefined {
  if (accessoryBudget < COMPOSER_ACCESSORY_LAYOUT.largeAccessory.minimumExpandedHeightPx) {
    return undefined
  }
  return Math.min(accessoryBudget, COMPOSER_ACCESSORY_LAYOUT.largeAccessory.maximumHeightPx)
}

export function resolveTodoAccessoryPresentation(accessoryBudget: number): TodoAccessoryPresentation {
  if (accessoryBudget < COMPOSER_ACCESSORY_LAYOUT.task.minimumDocumentHeightPx) return "hidden"
  return "expanded"
}

export function resolveTodoAccessoryHeight(accessoryBudget: number): number | undefined {
  if (resolveTodoAccessoryPresentation(accessoryBudget) !== "expanded") return undefined
  return Math.min(accessoryBudget, COMPOSER_ACCESSORY_LAYOUT.task.maximumHeightPx)
}

export function resolveComposerReplacementHeight(
  layout: ComposerAccessoryLayout | undefined,
): number {
  if (!layout || layout.paneHeight <= 0) {
    return COMPOSER_ACCESSORY_LAYOUT.composerReplacement.maximumHeightPx
  }

  return Math.min(
    COMPOSER_ACCESSORY_LAYOUT.composerReplacement.maximumHeightPx,
    nonNegative(
      layout.paneHeight -
        layout.reservedContentHeight -
        COMPOSER_ACCESSORY_LAYOUT.accessoryGapPx -
        COMPOSER_ACCESSORY_LAYOUT.composerReplacement.persistentFooterHeightPx -
        layout.preferredTranscriptReserve,
    ),
  )
}

export function canRestoreLargeAccessory(accessoryBudget: number): boolean {
  return accessoryBudget >= COMPOSER_ACCESSORY_LAYOUT.largeAccessory.restoreHeightPx
}

export function canAutoRestoreLargeAccessory(input: {
  minimizedBySize: boolean
  layoutAccessoryBudget: number
  composerCapacity: ComposerAccessoryCapacity
}): boolean {
  return (
    input.minimizedBySize &&
    canRestoreLargeAccessory(input.layoutAccessoryBudget) &&
    capacityAllowsLargeAccessoryRestore(input.composerCapacity)
  )
}
