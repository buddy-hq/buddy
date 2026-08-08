import { useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_MODE_REQUEST_POLICY,
  defaultBenchObjectViewID,
  isSameBenchTarget,
  type BenchAutoOpenIdentity,
  type OpenBenchResult,
  type BenchTarget,
  useOpenBench,
} from "@/lib/bench-navigation"
import type { MessageWithParts } from "@/state/chat-types"
import {
  TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  useTransientBenchSurface,
  type WhiteboardOpeningTransientBenchSurface,
} from "@/components/bench/transient-bench-surface"
import { readLatestActiveWhiteboardCreate } from "./whiteboard-progressive"
import { useLiveWhiteboardMessages } from "./whiteboard-live-messages"
import { WhiteboardPane } from "./whiteboard-pane"

const WHITEBOARD_BENCH_OBJECT_KIND = "whiteboard" as const
const WHITEBOARD_BENCH_AUTO_OPEN_MAX_ATTEMPTS = 6
const WHITEBOARD_BENCH_AUTO_OPEN_RETRY_BASE_DELAY_MS = 50
const WHITEBOARD_BENCH_AUTO_OPEN_RETRY_BACKOFF_FACTOR = 2

type WhiteboardBenchAutoOpenResolution = "complete" | "retry" | "stop"

type WhiteboardBenchAutoOpenProps = {
  directory: string
  sessionID?: string
  messages: MessageWithParts[]
}

function whiteboardBenchAutoOpenIdentity(activeToolKey: string): BenchAutoOpenIdentity {
  return {
    policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
    eventKey: activeToolKey,
  }
}

function whiteboardBenchTargetFromObjectID(objectID: string): BenchTarget {
  return {
    type: "object",
    ref: {
      kind: WHITEBOARD_BENCH_OBJECT_KIND,
      objectID,
      revisionID: null,
      itemID: null,
    },
    viewID: defaultBenchObjectViewID(WHITEBOARD_BENCH_OBJECT_KIND),
  }
}

function resolveWhiteboardBenchAutoOpenResult(
  result: OpenBenchResult,
  target: BenchTarget,
): WhiteboardBenchAutoOpenResolution {
  if (result.outcome === "committed") {
    const visibleTarget = result.projection.bench.target
    return result.projection.bench.visibility === "visible" &&
      visibleTarget !== null &&
      isSameBenchTarget(visibleTarget, target)
      ? "complete"
      : "retry"
  }

  if (result.outcome === "inactive" || result.outcome === "superseded") {
    return "retry"
  }

  return "stop"
}

function whiteboardBenchAutoOpenRetryDelay(attempt: number): number {
  return (
    WHITEBOARD_BENCH_AUTO_OPEN_RETRY_BASE_DELAY_MS *
    WHITEBOARD_BENCH_AUTO_OPEN_RETRY_BACKOFF_FACTOR ** attempt
  )
}

function waitForWhiteboardBenchAutoOpenRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, whiteboardBenchAutoOpenRetryDelay(attempt))
  })
}

function shouldStartWhiteboardBenchAutoOpen(input: {
  activeToolKey: string | undefined
  sessionID: string | undefined
  handledToolKeys: ReadonlySet<string>
  inFlightToolKey: string | undefined
}): input is {
  activeToolKey: string
  sessionID: string
  handledToolKeys: ReadonlySet<string>
  inFlightToolKey: string | undefined
} {
  if (!input.activeToolKey || !input.sessionID) return false
  if (input.handledToolKeys.has(input.activeToolKey)) return false
  return input.inFlightToolKey !== input.activeToolKey
}

function WhiteboardBenchAutoOpen(props: WhiteboardBenchAutoOpenProps) {
  const openBench = useOpenBench()
  const transientBench = useTransientBenchSurface()
  const messages = useLiveWhiteboardMessages(props.messages)
  const handledToolKeysRef = useRef(new Set<string>())
  const inFlightToolKeyRef = useRef<string>()
  const activeTool = useMemo(
    () => readLatestActiveWhiteboardCreate(messages),
    [messages],
  )
  const activeToolRef = useRef(activeTool)
  activeToolRef.current = activeTool
  const activeToolBelongsToSession = activeTool?.sessionID === props.sessionID
  const previewToolKey = (() => {
    if (!activeTool) return undefined
    if (activeTool.sessionID !== props.sessionID || activeTool.requestKind !== "new") {
      return undefined
    }
    return activeTool.toolKey
  })()
  const previewSurface = useMemo<WhiteboardOpeningTransientBenchSurface | null>(
    () =>
      previewToolKey
        ? {
            type: TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
            toolKey: previewToolKey,
          }
        : null,
    [previewToolKey],
  )
  const transientOpen = transientBench?.open
  const transientClose = transientBench?.close
  const authorizedTool =
    activeTool?.phase === "authorized" && activeToolBelongsToSession ? activeTool : undefined
  const authorizedToolKey = authorizedTool?.toolKey
  const authorizedObjectID = authorizedTool?.objectID

  useEffect(() => {
    if (!previewSurface || !transientOpen || !transientClose) return
    transientOpen(previewSurface)
    return () => {
      transientClose(previewSurface)
    }
  }, [previewSurface, transientClose, transientOpen])

  useEffect(() => {
    const autoOpenRequest = {
      activeToolKey: authorizedToolKey,
      sessionID: props.sessionID,
      handledToolKeys: handledToolKeysRef.current,
      inFlightToolKey: inFlightToolKeyRef.current,
    }
    if (!shouldStartWhiteboardBenchAutoOpen(autoOpenRequest)) {
      return
    }

    const toolKey = autoOpenRequest.activeToolKey
    const tool = activeToolRef.current
    if (!tool || tool.toolKey !== toolKey || tool.phase !== "authorized") return
    if (tool.sessionID !== autoOpenRequest.sessionID) return
    let cancelled = false
    inFlightToolKeyRef.current = toolKey

    void (async () => {
      const target = whiteboardBenchTargetFromObjectID(tool.objectID)
      for (let attempt = 0; attempt < WHITEBOARD_BENCH_AUTO_OPEN_MAX_ATTEMPTS; attempt += 1) {
        let resolution: WhiteboardBenchAutoOpenResolution = "retry"
        try {
          const result = await openBench({
            directory: props.directory,
            target,
            mode: BENCH_MODE_REQUEST_POLICY,
            autoOpen: whiteboardBenchAutoOpenIdentity(toolKey),
          })
          if (cancelled) return
          resolution = resolveWhiteboardBenchAutoOpenResult(result, target)
        } catch {
          // Best-effort auto-open retries transient controller failures without interrupting the
          // transcript stream.
        }

        if (resolution === "complete" || resolution === "stop") {
          handledToolKeysRef.current.add(toolKey)
          if (previewSurface) {
            transientClose?.(previewSurface)
          }
          return
        }

        const isLastAttempt = attempt === WHITEBOARD_BENCH_AUTO_OPEN_MAX_ATTEMPTS - 1
        if (!isLastAttempt) {
          await waitForWhiteboardBenchAutoOpenRetry(attempt)
          if (cancelled) return
        }
      }

      // Keep the transient preview visible. The active tool lifecycle will remove it; recording
      // the tool as handled here would turn a transient workspace race into a permanent miss.
    })().finally(() => {
      if (inFlightToolKeyRef.current === toolKey) {
        inFlightToolKeyRef.current = undefined
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    authorizedObjectID,
    authorizedToolKey,
    openBench,
    previewSurface,
    props.directory,
    props.sessionID,
    transientClose,
  ])

  if (
    !previewSurface ||
    transientBench?.activeSurface !== previewSurface ||
    !transientBench.host
  ) {
    return null
  }
  return createPortal(
    <WhiteboardPane
      directory={props.directory}
      previewToolKey={previewSurface.toolKey}
      isBusy={true}
      messages={props.messages}
    />,
    transientBench.host,
  )
}

export {
  WhiteboardBenchAutoOpen,
  resolveWhiteboardBenchAutoOpenResult,
  shouldStartWhiteboardBenchAutoOpen,
  whiteboardBenchAutoOpenIdentity,
  whiteboardBenchTargetFromObjectID,
}
