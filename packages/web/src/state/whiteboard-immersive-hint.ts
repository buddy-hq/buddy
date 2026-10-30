import { useEffect } from "react"
import { BENCH_CHAT_LAYOUT_DOCKED, type BenchMode, type BenchTabTarget } from "@/lib/bench-targets"
import { useStrictModeDeferredDisposal } from "@/lib/use-strict-mode-deferred-disposal"
import {
  WHITEBOARD_IMMERSIVE_HINT_NOTEBOOK_LIMIT,
  useUiPreferences,
  useUiPreferencesHydrated,
} from "@/state/ui-preferences"

export type THighlightWhiteboardImmersiveInput = {
  readonly directory: string
  readonly target: BenchTabTarget | null
  readonly benchDocked: boolean
}

export type TVisibleWhiteboardImmersiveHintInput = {
  readonly directory: string
  readonly target: BenchTabTarget | null
  readonly layoutMode: BenchMode
  readonly workspaceHydrated: boolean
  readonly transientBenchActive: boolean
  readonly immersiveControlMounted: boolean
}

export function visibleWhiteboardImmersiveHint(
  input: TVisibleWhiteboardImmersiveHintInput,
): THighlightWhiteboardImmersiveInput {
  const buttonOnScreen =
    input.workspaceHydrated &&
    !input.transientBenchActive &&
    input.immersiveControlMounted &&
    input.layoutMode === BENCH_CHAT_LAYOUT_DOCKED
  if (!buttonOnScreen) {
    return {
      directory: input.directory,
      target: null,
      benchDocked: false,
    }
  }
  return {
    directory: input.directory,
    target: input.target,
    benchDocked: true,
  }
}

type TWhiteboardImmersiveHintDecision = {
  readonly highlight: boolean
  readonly recordDirectory: string | null
}

function whiteboardObjectID(target: BenchTabTarget | null): string | null {
  if (target === null || target.type !== "object" || target.ref.kind !== "whiteboard") return null
  return target.ref.objectID
}

function resolveWhiteboardImmersiveHint(input: {
  readonly directories: readonly string[]
  readonly activeDirectory: string | null
  readonly activeObjectID: string | null
  readonly directory: string
  readonly objectID: string | null
  readonly benchDocked: boolean
  readonly ready: boolean
}): TWhiteboardImmersiveHintDecision {
  const showing =
    input.ready &&
    input.benchDocked &&
    input.objectID !== null &&
    input.activeDirectory === input.directory &&
    input.activeObjectID === input.objectID

  if (showing) return { highlight: true, recordDirectory: null }
  if (!input.ready || !input.benchDocked || input.objectID === null) {
    return { highlight: false, recordDirectory: null }
  }
  if (
    input.directories.includes(input.directory) ||
    input.directories.length >= WHITEBOARD_IMMERSIVE_HINT_NOTEBOOK_LIMIT
  ) {
    return { highlight: false, recordDirectory: null }
  }
  return { highlight: true, recordDirectory: input.directory }
}

export function useHighlightWhiteboardImmersive(
  input: THighlightWhiteboardImmersiveInput,
): boolean {
  const directories = useUiPreferences((state) => state.whiteboardImmersiveHintDirectories)
  const active = useUiPreferences((state) => state.activeWhiteboardImmersiveHint)
  const begin = useUiPreferences((state) => state.beginWhiteboardImmersiveHint)
  const end = useUiPreferences((state) => state.endWhiteboardImmersiveHint)
  const hydrated = useUiPreferencesHydrated()
  const objectID = whiteboardObjectID(input.target)
  const decision = resolveWhiteboardImmersiveHint({
    directories,
    activeDirectory: active?.directory ?? null,
    activeObjectID: active?.objectID ?? null,
    directory: input.directory,
    objectID,
    benchDocked: input.benchDocked,
    ready: hydrated,
  })

  useEffect(() => {
    if (!hydrated) return
    if (decision.recordDirectory !== null && objectID !== null) {
      begin(decision.recordDirectory, objectID)
      return
    }
    if (!decision.highlight && active !== null) end()
  }, [active, begin, decision.highlight, decision.recordDirectory, end, hydrated, objectID])

  useStrictModeDeferredDisposal({
    ownerKey: input.directory,
    dispose: () => {
      const state = useUiPreferences.getState()
      if (state.activeWhiteboardImmersiveHint?.directory === input.directory) {
        state.endWhiteboardImmersiveHint()
      }
    },
  })

  return decision.highlight
}
