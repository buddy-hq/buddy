import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_BALANCED,
  BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  BENCH_MODE_REQUEST_POLICY,
  benchModePreferenceKey,
  isSameBenchTarget,
  type BenchLayoutProfileID,
  type BenchMode,
  type BenchModePreferenceKey,
  type BenchOpenRequest,
  type BenchTarget,
} from "./bench-targets"
import type { BenchPresentationPreferences } from "./bench-preferences"

type BenchSurfaceDefaults = {
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
}

type BenchGeometryDirective =
  | "preserve"
  | "use-profile"

type BenchTransition =
  | "enter"
  | "exit"
  | "replace"
  | "change-mode"
  | "replace-and-change-mode"
  | "none"

type BenchOpenPolicyState =
  | {
      status: "closed"
    }
  | {
      status: "open"
      directory: string
      target: BenchTarget
      mode: BenchMode
      layoutProfile: BenchLayoutProfileID
    }

type BenchIgnorePolicyID =
  | "already-open"
  | "auto-open-suppressed"
  | "auto-open-not-authorized"
  | "leave-guard-blocked"

type BenchResolvedOpenPolicyID =
  | "explicit-mode"
  | "saved-surface-mode"
  | "target-default-mode"
  | "docked-fallback"
  | "preserved-current-mode"

type BenchOpenDecision =
  | {
      action: "ignore"
      policyID: BenchIgnorePolicyID
    }
  | {
      action: "open"
      directory: string
      target: BenchTarget
      mode: BenchMode
      layoutProfile: BenchLayoutProfileID
      dockedWidth: BenchGeometryDirective
      floatingSize: BenchGeometryDirective
      floatingPosition: BenchGeometryDirective
      policyID: BenchResolvedOpenPolicyID
    }

type ResolveBenchOpenPolicyInput = {
  request: BenchOpenRequest
  current: BenchOpenPolicyState
  defaults: BenchSurfaceDefaults
  preferences: BenchPresentationPreferences
  autoOpenSuppressed: boolean
}

const BENCH_SURFACE_DEFAULTS = {
  reading: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
  },
  whiteboard: {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  markdown: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  file: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:mermaid": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:html-widget": {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:figure": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:freeform-figure": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:media-presentation": {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
    layoutProfile: BENCH_LAYOUT_PROFILE_BENCH_FIRST,
  },
  "artifact:question-set": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
  },
  "artifact:flashcard-deck": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
  },
} satisfies Record<BenchModePreferenceKey, BenchSurfaceDefaults>

function resolveBenchSurfaceDefaults(target: BenchTarget): BenchSurfaceDefaults {
  return BENCH_SURFACE_DEFAULTS[benchModePreferenceKey(target)]
}

function resolveBenchOpenMode(input: {
  request: BenchOpenRequest
  current: BenchOpenPolicyState
  defaults: BenchSurfaceDefaults
  preferences: BenchPresentationPreferences
}): {
  mode: BenchMode
  policyID: BenchResolvedOpenPolicyID
} {
  if (input.request.mode !== BENCH_MODE_REQUEST_POLICY) {
    return {
      mode: input.request.mode,
      policyID: "explicit-mode",
    }
  }

  if (input.current.status === "open") {
    return {
      mode: input.current.mode,
      policyID: "preserved-current-mode",
    }
  }

  const savedMode =
    input.preferences.modeBySurface[benchModePreferenceKey(input.request.target)]
  if (savedMode) {
    return {
      mode: savedMode,
      policyID: "saved-surface-mode",
    }
  }

  if (input.defaults.mode) {
    return {
      mode: input.defaults.mode,
      policyID: "target-default-mode",
    }
  }

  return {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
    policyID: "docked-fallback",
  }
}

function resolveBenchOpenPolicy(input: ResolveBenchOpenPolicyInput): BenchOpenDecision {
  if (input.request.autoOpen && input.autoOpenSuppressed) {
    return {
      action: "ignore",
      policyID: "auto-open-suppressed",
    }
  }

  if (
    input.request.autoOpen &&
    input.current.status === "open" &&
    (!isSameBenchTarget(input.current.target, input.request.target) ||
      input.current.directory !== input.request.directory)
  ) {
    return {
      action: "ignore",
      policyID: "auto-open-not-authorized",
    }
  }

  const resolvedMode = resolveBenchOpenMode({
    request: input.request,
    current: input.current,
    defaults: input.defaults,
    preferences: input.preferences,
  })

  if (
    input.current.status === "open" &&
    input.current.directory === input.request.directory &&
    isSameBenchTarget(input.current.target, input.request.target) &&
    input.current.mode === resolvedMode.mode &&
    input.current.layoutProfile === input.defaults.layoutProfile
  ) {
    return {
      action: "ignore",
      policyID: "already-open",
    }
  }

  const currentOpen = input.current.status === "open"
  return {
    action: "open",
    directory: input.request.directory,
    target: input.request.target,
    mode: resolvedMode.mode,
    layoutProfile: input.defaults.layoutProfile,
    dockedWidth: currentOpen ? "preserve" : "use-profile",
    floatingSize: currentOpen ? "preserve" : "use-profile",
    floatingPosition: currentOpen ? "preserve" : "use-profile",
    policyID: resolvedMode.policyID,
  }
}

function classifyBenchTransition(input: {
  previous: BenchOpenPolicyState
  next: BenchOpenPolicyState
}): BenchTransition {
  if (input.previous.status === "closed" && input.next.status === "closed") {
    return "none"
  }

  if (input.previous.status === "closed" && input.next.status === "open") {
    return "enter"
  }

  if (input.previous.status === "open" && input.next.status === "closed") {
    return "exit"
  }

  if (input.previous.status === "closed" || input.next.status === "closed") {
    return "none"
  }

  const targetChanged =
    input.previous.directory !== input.next.directory ||
    !isSameBenchTarget(input.previous.target, input.next.target)
  const modeChanged = input.previous.mode !== input.next.mode

  if (targetChanged && modeChanged) {
    return "replace-and-change-mode"
  }

  if (targetChanged) {
    return "replace"
  }

  if (modeChanged) {
    return "change-mode"
  }

  return "none"
}

export {
  classifyBenchTransition,
  resolveBenchOpenPolicy,
  resolveBenchSurfaceDefaults,
}
export type {
  BenchGeometryDirective,
  BenchIgnorePolicyID,
  BenchOpenDecision,
  BenchOpenPolicyState,
  BenchResolvedOpenPolicyID,
  BenchSurfaceDefaults,
  BenchTransition,
  ResolveBenchOpenPolicyInput,
}
