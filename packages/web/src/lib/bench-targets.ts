import { parseTJsonObject, parseTString, readNonEmptyString } from "@/components/chat/tools/types"

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

export type BenchSessionTarget = {
  type: "session"
  sessionID: string
}

export type BenchTabTarget = BenchTarget | BenchSessionTarget

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
  target: BenchTabTarget
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
  | "session"
  | "markdown"
  | "file"
  | "reading"
  | "whiteboard"
  | `artifact:${BenchNonFileObjectKind}`

function isBenchMode<TValue>(value: TValue): value is TValue & BenchMode {
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

function readNullableString<TValue>(value: TValue): string | null | undefined {
  if (value === null) return null
  return readNonEmptyString(value)
}

function readBenchTarget<TValue>(value: TValue): BenchTarget | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  if (record.type === "workspace-file") {
    const path = readNonEmptyString(record.path)
    const viewer =
      record.viewer === "markdown"
        ? ("markdown" as const)
        : record.viewer === "file"
          ? ("file" as const)
          : undefined
    const fragment = record.fragment === undefined ? undefined : readNonEmptyString(record.fragment)
    if (!path || !viewer || (record.fragment !== undefined && !fragment)) return undefined
    return Object.assign(
      {
        type: "workspace-file" as const,
        path,
        viewer,
      },
      fragment ? { fragment } : undefined,
    )
  }

  const ref = parseTJsonObject(record.ref)
  if (record.type !== "object" || !ref) return undefined
  const kind = parseTString(ref.kind)
  const objectID = readNonEmptyString(ref.objectID)
  const revisionID = readNullableString(ref.revisionID)
  const itemID = readNullableString(ref.itemID)
  const viewID = readNonEmptyString(record.viewID)
  if (
    kind === undefined ||
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

function readBenchTabTarget<TValue>(value: TValue): BenchTabTarget | undefined {
  const record = parseTJsonObject(value)
  if (record && record.type === "session") {
    const sessionID = readNonEmptyString(record.sessionID)
    return sessionID ? { type: "session", sessionID } : undefined
  }
  return readBenchTarget(value)
}

function readBenchChatLayoutMode<TValue>(value: TValue): BenchChatLayoutMode | undefined {
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

function benchSurfaceKey(target: BenchTabTarget): BenchSurfaceKey {
  if (target.type === "session") return "session"
  if (target.type === "object") {
    if (target.ref.kind === "resource") return "reading"
    if (target.ref.kind === "whiteboard") return "whiteboard"
    return `artifact:${target.ref.kind}`
  }

  return target.viewer
}

function benchTargetKey(target: BenchTabTarget): string {
  if (target.type === "session") {
    return ["session", encodeURIComponent(target.sessionID)].join(BENCH_TARGET_KEY_PART_SEPARATOR)
  }
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

function isSameBenchTarget(left: BenchTabTarget, right: BenchTabTarget): boolean {
  if (left.type === "workspace-file" && right.type === "workspace-file") {
    return benchTargetKey(left) === benchTargetKey(right) && left.fragment === right.fragment
  }

  return benchTargetKey(left) === benchTargetKey(right)
}

function isBenchContentTarget(target: BenchTabTarget): target is BenchTarget {
  return target.type !== "session"
}

export {
  benchSurfaceKey,
  benchTargetKey,
  defaultBenchObjectViewID,
  isBenchContentTarget,
  isBenchObjectKind,
  isSameBenchTarget,
  readBenchTabTarget,
  readBenchTarget,
  readBenchChatLayoutMode,
}
