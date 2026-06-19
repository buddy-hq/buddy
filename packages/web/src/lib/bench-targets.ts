export const BENCH_CHAT_SEARCH_PARAM = "benchChat"
export const BENCH_CHAT_LAYOUT_DOCKED = "docked"
export const BENCH_CHAT_LAYOUT_FLOATING = "floating"
export const BENCH_MODE_REQUEST_POLICY = "policy"
export const BENCH_LAYOUT_PROFILE_READING = "reading"
export const BENCH_LAYOUT_PROFILE_DOCUMENT = "document"
export const BENCH_LAYOUT_PROFILE_PRACTICE = "practice"
export const BENCH_LAYOUT_PROFILE_CODE = "code"
export const BENCH_LAYOUT_PROFILE_VISUAL = "visual"
export const BENCH_AUTO_OPEN_POLICY_WHITEBOARD = "whiteboard"
export const BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET = "fullscreen-html-widget"

export type BenchObjectKind =
  | "resource"
  | "whiteboard"
  | "mermaid"
  | "html-widget"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

type BenchNonFileObjectKind = Exclude<BenchObjectKind, "resource" | "whiteboard">

export type BenchObjectRef = {
  kind: BenchObjectKind
  objectID: string
  revisionID: string | null
  itemID: string | null
}

export type BenchTarget =
  | { type: "workspace-file"; path: string; viewer: "markdown" | "file" }
  | { type: "object"; ref: BenchObjectRef; viewID: string }

export type BenchMode = typeof BENCH_CHAT_LAYOUT_DOCKED | typeof BENCH_CHAT_LAYOUT_FLOATING

export type BenchChatLayoutMode = BenchMode

export type BenchModeRequest = typeof BENCH_MODE_REQUEST_POLICY | BenchMode

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
  | typeof BENCH_LAYOUT_PROFILE_READING
  | typeof BENCH_LAYOUT_PROFILE_DOCUMENT
  | typeof BENCH_LAYOUT_PROFILE_PRACTICE
  | typeof BENCH_LAYOUT_PROFILE_CODE
  | typeof BENCH_LAYOUT_PROFILE_VISUAL

export type BenchModePreferenceKey =
  | "markdown"
  | "file"
  | "reading"
  | "whiteboard"
  | `artifact:${BenchNonFileObjectKind}`

function isBenchMode(value: unknown): value is BenchMode {
  return value === BENCH_CHAT_LAYOUT_FLOATING || value === BENCH_CHAT_LAYOUT_DOCKED
}

function isBenchObjectKind(value: string): value is BenchObjectKind {
  return (
    value === "resource" ||
    value === "whiteboard" ||
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

function defaultBenchObjectViewID(kind: BenchObjectKind): string {
  switch (kind) {
    case "resource":
      return "reader"
    case "whiteboard":
      return "current"
    case "html-widget":
      return "runtime"
    case "media-presentation":
      return "gallery"
    case "mermaid":
      return "rendered"
    case "figure":
    case "freeform-figure":
      return "rendered"
    case "question-set":
      return "practice"
    case "flashcard-deck":
      return "review"
  }
}

function benchModePreferenceKey(target: BenchTarget): BenchModePreferenceKey {
  if (target.type === "object") {
    if (target.ref.kind === "resource") return "reading"
    if (target.ref.kind === "whiteboard") return "whiteboard"
    return `artifact:${target.ref.kind}`
  }

  return target.viewer
}

function isSameBenchTarget(left: BenchTarget, right: BenchTarget): boolean {
  if (left.type !== right.type) return false

  if (left.type === "workspace-file" && right.type === "workspace-file") {
    return left.path === right.path && left.viewer === right.viewer
  }

  if (left.type === "object" && right.type === "object") {
    return (
      left.ref.kind === right.ref.kind &&
      left.ref.objectID === right.ref.objectID &&
      left.ref.revisionID === right.ref.revisionID &&
      left.ref.itemID === right.ref.itemID &&
      left.viewID === right.viewID
    )
  }

  return false
}

export {
  benchModePreferenceKey,
  defaultBenchObjectViewID,
  isBenchObjectKind,
  isSameBenchTarget,
  readBenchChatLayoutMode,
}
