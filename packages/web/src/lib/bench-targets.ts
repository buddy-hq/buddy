export const BENCH_CHAT_SEARCH_PARAM = "benchChat"
export const BENCH_CHAT_LAYOUT_DOCKED = "docked"
export const BENCH_CHAT_LAYOUT_FLOATING = "floating"
export const BENCH_DOCK_FLOATING_CHAT_EVENT = "buddy:bench:dock-floating-chat"
export const BENCH_MODE_REQUEST_POLICY = "policy"
export const BENCH_LAYOUT_PROFILE_READING = "reading"
export const BENCH_LAYOUT_PROFILE_DOCUMENT = "document"
export const BENCH_LAYOUT_PROFILE_PRACTICE = "practice"
export const BENCH_LAYOUT_PROFILE_CODE = "code"
export const BENCH_LAYOUT_PROFILE_VISUAL = "visual"
export const BENCH_AUTO_OPEN_POLICY_WHITEBOARD = "whiteboard"
export const BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET = "fullscreen-html-widget"
const BENCH_TARGET_KEY_PART_SEPARATOR = "\u0000"
const BENCH_TARGET_KEY_NULL_PART = "\u2400"

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
  | {
      type: "workspace-file"
      path: string
      viewer: "markdown" | "file"
      fragment?: string
    }
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

export type BenchSurfaceKey =
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

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return readNonEmptyString(value)
}

function readBenchTarget(value: unknown): BenchTarget | undefined {
  if (!isUnknownRecord(value)) return undefined
  if (value.type === "workspace-file") {
    const path = readNonEmptyString(value.path)
    const viewer = value.viewer === "markdown" || value.viewer === "file" ? value.viewer : undefined
    const fragment = value.fragment === undefined ? undefined : readNonEmptyString(value.fragment)
    if (!path || !viewer || (value.fragment !== undefined && !fragment)) return undefined
    return {
      type: "workspace-file",
      path,
      viewer,
      ...(fragment ? { fragment } : {}),
    }
  }

  if (value.type !== "object" || !isUnknownRecord(value.ref)) return undefined
  const kind = value.ref.kind
  const objectID = readNonEmptyString(value.ref.objectID)
  const revisionID = readNullableString(value.ref.revisionID)
  const itemID = readNullableString(value.ref.itemID)
  const viewID = readNonEmptyString(value.viewID)
  if (
    typeof kind !== "string" ||
    !isBenchObjectKind(kind) ||
    !objectID ||
    revisionID === undefined ||
    itemID === undefined ||
    !viewID
  ) {
    return undefined
  }
  return {
    type: "object",
    ref: {
      kind,
      objectID,
      revisionID,
      itemID,
    },
    viewID,
  }
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

function benchSurfaceKey(target: BenchTarget): BenchSurfaceKey {
  if (target.type === "object") {
    if (target.ref.kind === "resource") return "reading"
    if (target.ref.kind === "whiteboard") return "whiteboard"
    return `artifact:${target.ref.kind}`
  }

  return target.viewer
}

function benchTargetKey(target: BenchTarget): string {
  if (target.type === "workspace-file") {
    // This is the shared frontend/backend content identity. Route-only state such as a
    // Markdown fragment must not change the key used by Bench context acknowledgements.
    return ["workspace-file", target.viewer, encodeURIComponent(target.path)].join(
      BENCH_TARGET_KEY_PART_SEPARATOR,
    )
  }

  return [
    "object",
    target.ref.kind,
    encodeURIComponent(target.ref.objectID),
    target.ref.revisionID ? encodeURIComponent(target.ref.revisionID) : BENCH_TARGET_KEY_NULL_PART,
    target.ref.itemID ? encodeURIComponent(target.ref.itemID) : BENCH_TARGET_KEY_NULL_PART,
    encodeURIComponent(target.viewID),
  ].join(BENCH_TARGET_KEY_PART_SEPARATOR)
}

function isSameBenchTarget(left: BenchTarget, right: BenchTarget): boolean {
  if (left.type === "workspace-file" && right.type === "workspace-file") {
    return benchTargetKey(left) === benchTargetKey(right) && left.fragment === right.fragment
  }

  return benchTargetKey(left) === benchTargetKey(right)
}

function isSessionOwnedBenchTarget(target: BenchTarget): boolean {
  return target.type === "object" && target.ref.kind === "whiteboard"
}

export {
  benchSurfaceKey,
  benchTargetKey,
  defaultBenchObjectViewID,
  isBenchObjectKind,
  isSessionOwnedBenchTarget,
  isSameBenchTarget,
  readBenchTarget,
  readBenchChatLayoutMode,
}
