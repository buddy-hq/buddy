export const BENCH_CHAT_SEARCH_PARAM = "benchChat"
export const BENCH_CHAT_LAYOUT_DOCKED = "docked"
export const BENCH_CHAT_LAYOUT_FLOATING = "floating"
export const BENCH_MODE_REQUEST_POLICY = "policy"
export const BENCH_LAYOUT_PROFILE_BALANCED = "balanced"
export const BENCH_LAYOUT_PROFILE_BENCH_FIRST = "bench-first"
export const BENCH_AUTO_OPEN_POLICY_WHITEBOARD = "whiteboard"
export const BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET = "fullscreen-html-widget"

export type BenchArtifactKind =
  | "mermaid"
  | "html-widget"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

export type BenchTarget =
  | { type: "reading"; path: string; resourceID?: string }
  | { type: "whiteboard" }
  | { type: "markdown"; path: string }
  | { type: "artifact"; kind: BenchArtifactKind; artifactID: string; itemID?: string }
  | { type: "file"; path: string }

export type BenchMode =
  | typeof BENCH_CHAT_LAYOUT_DOCKED
  | typeof BENCH_CHAT_LAYOUT_FLOATING

export type BenchChatLayoutMode = BenchMode

export type BenchModeRequest =
  | typeof BENCH_MODE_REQUEST_POLICY
  | BenchMode

export type BenchAutoOpenPolicyID =
  | typeof BENCH_AUTO_OPEN_POLICY_WHITEBOARD
  | typeof BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET

export type BenchAutoOpenIdentity = {
  policyID: BenchAutoOpenPolicyID
  eventKey: string
}

export type BenchOpenRequest = {
  directory: string
  target: BenchTarget
  mode: BenchModeRequest
  autoOpen: BenchAutoOpenIdentity | null
}

export type BenchLayoutProfileID =
  | typeof BENCH_LAYOUT_PROFILE_BENCH_FIRST
  | typeof BENCH_LAYOUT_PROFILE_BALANCED

export type BenchModePreferenceKey =
  | "reading"
  | "whiteboard"
  | "markdown"
  | "file"
  | `artifact:${BenchArtifactKind}`

function isBenchMode(value: unknown): value is BenchMode {
  return value === BENCH_CHAT_LAYOUT_FLOATING || value === BENCH_CHAT_LAYOUT_DOCKED
}

function isBenchArtifactKind(value: string): value is BenchArtifactKind {
  return (
    value === "mermaid" ||
    value === "html-widget" ||
    value === "figure" ||
    value === "freeform-figure" ||
    value === "media-presentation" ||
    value === "question-set" ||
    value === "flashcard-deck"
  )
}

function readBenchChatLayoutMode(value: unknown): BenchChatLayoutMode | undefined {
  return isBenchMode(value) ? value : undefined
}

function benchModePreferenceKey(target: BenchTarget): BenchModePreferenceKey {
  if (target.type === "artifact") {
    return `artifact:${target.kind}`
  }

  return target.type
}

function isSameBenchTarget(left: BenchTarget, right: BenchTarget): boolean {
  if (left.type !== right.type) return false

  if (left.type === "whiteboard" && right.type === "whiteboard") {
    return true
  }

  if (left.type === "reading" && right.type === "reading") {
    return left.path === right.path && left.resourceID === right.resourceID
  }

  if (left.type === "markdown" && right.type === "markdown") {
    return left.path === right.path
  }

  if (left.type === "file" && right.type === "file") {
    return left.path === right.path
  }

  if (left.type === "artifact" && right.type === "artifact") {
    return (
      left.kind === right.kind &&
      left.artifactID === right.artifactID &&
      left.itemID === right.itemID
    )
  }

  return false
}

export {
  benchModePreferenceKey,
  isBenchArtifactKind,
  isSameBenchTarget,
  readBenchChatLayoutMode,
}
