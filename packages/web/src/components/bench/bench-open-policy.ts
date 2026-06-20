import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  isBenchObjectKind,
  type BenchAutoOpenIdentity,
  type BenchAutoOpenPolicyID,
  type BenchObjectRef,
  type BenchTarget,
} from "@/lib/bench-navigation"

export {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
} from "@/lib/bench-navigation"
export type { BenchAutoOpenPolicyID } from "@/lib/bench-navigation"

const BENCH_PRESENT_TOOL = "bench_present"
const BENCH_PRESENT_STATUS_PRESENTED = "presented"
const BENCH_PRESENT_STATUS_ALREADY_PRESENTING = "already_presenting"
const BENCH_PRESENT_STATUS_CLOSED = "closed"
const BENCH_PRESENT_ACTION_CLOSE = "close"
const PRESENTATION_SURFACE_BENCH = "bench"

export type BenchAutoOpenCandidate = {
  policyID: BenchAutoOpenPolicyID
  eventKey: string
  target: BenchTarget
}

export type ActiveWhiteboardAutoOpen = {
  policyID: typeof BENCH_AUTO_OPEN_POLICY_WHITEBOARD
  eventKey: string
  sessionID: string
}

type ResolveBenchAutoOpenSuppressionsInput = {
  workspaceWasOpen: boolean
  workspaceOpen: boolean
  activeWhiteboard: ActiveWhiteboardAutoOpen | undefined
  candidate: BenchAutoOpenCandidate | undefined
}

export type BenchPresentationAction =
  | {
      action: "open"
      eventKey: string
      target: BenchTarget
    }
  | {
      action: "close"
      eventKey: string
    }

export function htmlWidgetAutoOpenKey(objectID: string): string {
  return `${BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET}:${objectID}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return readString(value)
}

function isBenchAutoOpenPolicyID(value: string): value is BenchAutoOpenPolicyID {
  return (
    value === BENCH_AUTO_OPEN_POLICY_WHITEBOARD ||
    value === BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET
  )
}

function readBenchObjectRef(value: unknown): BenchObjectRef | undefined {
  if (!isRecord(value)) return undefined

  const kind = readString(value.kind)
  const objectID = readString(value.objectID)
  const revisionID = readNullableString(value.revisionID)
  const itemID = readNullableString(value.itemID)
  if (!kind || !isBenchObjectKind(kind) || !objectID) return undefined
  if (revisionID === undefined || itemID === undefined) return undefined

  return {
    kind,
    objectID,
    revisionID,
    itemID,
  }
}

function readBenchTarget(value: unknown): BenchTarget | undefined {
  if (!isRecord(value)) return undefined

  const type = readString(value.type)
  if (type === "workspace-file") {
    const path = readString(value.path)
    const viewer = readString(value.viewer)
    if (!path || (viewer !== "markdown" && viewer !== "file")) return undefined
    return {
      type,
      path,
      viewer,
    }
  }

  if (type === "object") {
    const ref = readBenchObjectRef(value.ref)
    const viewID = readString(value.viewID)
    if (!ref || !viewID) return undefined
    return {
      type,
      ref,
      viewID,
    }
  }

  return undefined
}

function readBenchAutoOpen(value: unknown): Omit<BenchAutoOpenCandidate, "target"> | undefined {
  if (!isRecord(value)) return undefined

  const policyID = readString(value.policyID)
  const eventKey = readString(value.eventKey)
  if (!policyID || !isBenchAutoOpenPolicyID(policyID) || !eventKey) return undefined

  return {
    policyID,
    eventKey,
  }
}

function readBenchAutoOpenCandidateMetadata(value: unknown): BenchAutoOpenCandidate | undefined {
  if (!isRecord(value)) return undefined

  const autoOpen = readBenchAutoOpen(value)
  const target = readBenchTarget(value.target)
  if (!autoOpen || !target) return undefined

  return {
    ...autoOpen,
    target,
  }
}

function readObjectPresentationAutoOpenCandidate(
  value: unknown,
): BenchAutoOpenCandidate | undefined {
  if (!isRecord(value)) return undefined

  const autoOpen = readBenchAutoOpen(value.autoOpen)
  const ref = readBenchObjectRef(value.ref)
  const viewID = readString(value.viewID)
  if (!autoOpen || !ref || !viewID) return undefined

  return {
    ...autoOpen,
    target: {
      type: "object",
      ref,
      viewID,
    },
  }
}

function readCompletedObjectAutoOpenCandidate(
  part: MessagePart,
): BenchAutoOpenCandidate | undefined {
  if (part.type !== "tool") return undefined

  const state = parseToolState(part)
  if (state.status !== "completed") return undefined
  if (!isRecord(state.metadata.buddyObjectResult)) return undefined

  const presentations = state.metadata.buddyObjectResult.presentations
  if (!Array.isArray(presentations)) return undefined

  for (const presentation of presentations.toReversed()) {
    if (!isRecord(presentation)) continue
    if (presentation.surface !== PRESENTATION_SURFACE_BENCH) continue
    const candidate = readObjectPresentationAutoOpenCandidate(presentation)
    if (candidate) return candidate
  }

  return undefined
}

function readStartOfToolAutoOpenCandidate(part: MessagePart): BenchAutoOpenCandidate | undefined {
  if (part.type !== "tool") return undefined

  const state = parseToolState(part)
  if (state.status !== "pending" && state.status !== "running") return undefined

  return readBenchAutoOpenCandidateMetadata(state.metadata.benchAutoOpenCandidate)
}

function readActiveWhiteboardAutoOpen(part: MessagePart): ActiveWhiteboardAutoOpen | undefined {
  if (part.type !== "tool" || part.tool !== "whiteboard_create_view") return undefined

  const state = parseToolState(part)
  if (state.status !== "pending" && state.status !== "running") return undefined

  const sessionID = readString(part.sessionID)
  const messageID = readString(part.messageID)
  const callID = readString(part.callID)
  if (!sessionID || !messageID || !callID) return undefined

  return {
    policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
    eventKey: `whiteboard:${sessionID}:${messageID}:${callID}`,
    sessionID,
  }
}

function readBenchPresentationAction(input: {
  messageID: string
  part: MessagePart
}): BenchPresentationAction | undefined {
  if (input.part.type !== "tool" || input.part.tool !== BENCH_PRESENT_TOOL) return undefined

  const state = parseToolState(input.part)
  if (state.status !== "completed") return undefined

  const action = readString(state.metadata.benchAction)
  const status = readString(state.metadata.benchStatus)
  const reason = readString(state.metadata.reason) ?? "none"
  const eventKey = `${input.messageID}:${input.part.id}:bench-present:${status ?? "unknown"}:${reason}`

  if (action === BENCH_PRESENT_ACTION_CLOSE && status === BENCH_PRESENT_STATUS_CLOSED) {
    return {
      action: "close",
      eventKey,
    }
  }

  if (
    status !== BENCH_PRESENT_STATUS_PRESENTED &&
    status !== BENCH_PRESENT_STATUS_ALREADY_PRESENTING
  ) {
    return undefined
  }

  const target = readBenchTarget(state.metadata.benchTarget)
  if (!target) return undefined

  return {
    action: "open",
    eventKey,
    target,
  }
}

export function readLatestBenchAction(
  messages: MessageWithParts[],
): BenchPresentationAction | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role === "user") {
      return undefined
    }

    if (message.info.role !== "assistant") {
      continue
    }

    for (const part of message.parts.toReversed()) {
      const action = readBenchPresentationAction({
        messageID: message.info.id,
        part,
      })
      if (action) return action
    }
  }

  return undefined
}

export function readLatestBenchAutoOpenCandidate(
  messages: MessageWithParts[],
): BenchAutoOpenCandidate | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role === "user") {
      return undefined
    }

    if (message.info.role !== "assistant") {
      continue
    }

    for (const part of message.parts.toReversed()) {
      const startCandidate = readStartOfToolAutoOpenCandidate(part)
      if (startCandidate) return startCandidate

      const completedCandidate = readCompletedObjectAutoOpenCandidate(part)
      if (completedCandidate) return completedCandidate
    }
  }

  return undefined
}

export function readLatestActiveWhiteboardAutoOpen(
  messages: MessageWithParts[],
): ActiveWhiteboardAutoOpen | undefined {
  for (const message of messages.toReversed()) {
    if (message.info.role === "user") {
      return undefined
    }

    if (message.info.role !== "assistant") {
      continue
    }
    if (isTerminalAssistantMessageInfo(message.info)) {
      continue
    }

    for (const part of message.parts.toReversed()) {
      const activeWhiteboard = readActiveWhiteboardAutoOpen(part)
      if (activeWhiteboard) return activeWhiteboard
    }
  }

  return undefined
}

export function resolveBenchAutoOpenSuppressions(
  input: ResolveBenchAutoOpenSuppressionsInput,
): BenchAutoOpenIdentity[] {
  if (!input.workspaceWasOpen || input.workspaceOpen) return []

  const suppressions: BenchAutoOpenIdentity[] = []
  if (input.activeWhiteboard) {
    suppressions.push({
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: input.activeWhiteboard.eventKey,
    })
  }
  const candidate = input.candidate
  if (
    candidate &&
    !suppressions.some(
      (suppression) =>
        suppression.policyID === candidate.policyID && suppression.eventKey === candidate.eventKey,
    )
  ) {
    suppressions.push({
      policyID: candidate.policyID,
      eventKey: candidate.eventKey,
    })
  }
  return suppressions
}
