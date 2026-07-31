import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_CODE,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_PRACTICE,
  BENCH_LAYOUT_PROFILE_READING,
  BENCH_LAYOUT_PROFILE_VISUAL,
  BENCH_MODE_REQUEST_POLICY,
  benchSurfaceKey,
  isSameBenchTarget,
  type BenchLayoutProfileID,
  type BenchMode,
  type BenchOpenRequest,
  type BenchSurfaceKey,
  type BenchTarget,
} from "./bench-targets"
import { classifyWorkspaceMedia, isWorkspaceReaderPath } from "./workspace-file-media"

type BenchSurfaceDefaults = {
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
}

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
      policyID: BenchResolvedOpenPolicyID
    }

type ResolveBenchOpenPolicyInput = {
  request: BenchOpenRequest
  current: BenchOpenPolicyState
  currentVisible: boolean
  defaults: BenchSurfaceDefaults
  autoOpenSuppressed: boolean
}

const BENCH_SURFACE_DEFAULTS = {
  reading: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  whiteboard: {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
  },
  markdown: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  file: {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  "artifact:mermaid": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  "artifact:html-widget": {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
  },
  "artifact:figure": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  "artifact:freeform-figure": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  "artifact:media-presentation": {
    mode: BENCH_CHAT_LAYOUT_FLOATING,
  },
  "artifact:question-set": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
  "artifact:flashcard-deck": {
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  },
} satisfies Record<BenchSurfaceKey, Pick<BenchSurfaceDefaults, "mode">>

function resolveWorkspaceFileLayoutProfile(
  target: Extract<BenchTarget, { type: "workspace-file" }>,
) {
  if (target.viewer === "markdown") return BENCH_LAYOUT_PROFILE_DOCUMENT
  if (isWorkspaceReaderPath(target.path)) return BENCH_LAYOUT_PROFILE_READING

  const media = classifyWorkspaceMedia({
    path: target.path,
    mimeType: undefined,
    sizeBytes: undefined,
  })
  if (
    media.renderMode === "image" ||
    media.renderMode === "audio" ||
    media.renderMode === "video"
  ) {
    return BENCH_LAYOUT_PROFILE_VISUAL
  }

  return BENCH_LAYOUT_PROFILE_CODE
}

function resolveObjectLayoutProfile(target: Extract<BenchTarget, { type: "object" }>) {
  switch (target.ref.kind) {
    case "resource":
      return BENCH_LAYOUT_PROFILE_READING
    case "question-set":
    case "flashcard-deck":
      return BENCH_LAYOUT_PROFILE_PRACTICE
    case "whiteboard":
    case "mermaid":
    case "html-widget":
    case "figure":
    case "freeform-figure":
    case "media-presentation":
      return BENCH_LAYOUT_PROFILE_VISUAL
  }
}

function resolveBenchLayoutProfile(target: BenchTarget): BenchLayoutProfileID {
  if (target.type === "workspace-file") {
    return resolveWorkspaceFileLayoutProfile(target)
  }

  return resolveObjectLayoutProfile(target)
}

function resolveBenchSurfaceDefaults(target: BenchTarget): BenchSurfaceDefaults {
  return {
    ...BENCH_SURFACE_DEFAULTS[benchSurfaceKey(target)],
    layoutProfile: resolveBenchLayoutProfile(target),
  }
}

function resolveBenchOpenMode(input: {
  request: BenchOpenRequest
  current: BenchOpenPolicyState
  defaults: BenchSurfaceDefaults
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
    input.request.autoOpen.policyID !== BENCH_AUTO_OPEN_POLICY_WHITEBOARD &&
    input.current.status === "open" &&
    input.currentVisible &&
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

  return {
    action: "open",
    directory: input.request.directory,
    target: input.request.target,
    mode: resolvedMode.mode,
    layoutProfile: input.defaults.layoutProfile,
    policyID: resolvedMode.policyID,
  }
}

export { resolveBenchLayoutProfile, resolveBenchOpenPolicy, resolveBenchSurfaceDefaults }
export type {
  BenchIgnorePolicyID,
  BenchOpenDecision,
  BenchOpenPolicyState,
  BenchResolvedOpenPolicyID,
  BenchSurfaceDefaults,
  ResolveBenchOpenPolicyInput,
}
