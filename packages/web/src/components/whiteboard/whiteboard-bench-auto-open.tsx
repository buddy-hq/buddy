import { useEffect, useMemo, useRef } from "react"
import type { ObjectWhiteboardSessionReadResponse } from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_MODE_REQUEST_POLICY,
  defaultBenchObjectViewID,
  type BenchAutoOpenIdentity,
  type BenchTarget,
  useOpenBench,
} from "@/lib/bench-navigation"
import type { MessageWithParts } from "@/state/chat-types"
import { readLatestActiveWhiteboardCreateKey } from "./whiteboard-progressive"

const WHITEBOARD_BENCH_OBJECT_KIND = "whiteboard" as const

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

function whiteboardBenchTargetFromSession(
  session: ObjectWhiteboardSessionReadResponse,
): BenchTarget | undefined {
  if (!session.objectID) return undefined
  return {
    type: "object",
    ref: {
      kind: WHITEBOARD_BENCH_OBJECT_KIND,
      objectID: session.objectID,
      revisionID: null,
      itemID: null,
    },
    viewID: defaultBenchObjectViewID(WHITEBOARD_BENCH_OBJECT_KIND),
  }
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
  const handledToolKeysRef = useRef(new Set<string>())
  const inFlightToolKeyRef = useRef<string>()
  const activeToolKey = useMemo(
    () => readLatestActiveWhiteboardCreateKey(props.messages),
    [props.messages],
  )

  useEffect(() => {
    const autoOpenRequest = {
      activeToolKey,
      sessionID: props.sessionID,
      handledToolKeys: handledToolKeysRef.current,
      inFlightToolKey: inFlightToolKeyRef.current,
    }
    if (!shouldStartWhiteboardBenchAutoOpen(autoOpenRequest)) {
      return
    }

    const toolKey = autoOpenRequest.activeToolKey
    const sessionID = autoOpenRequest.sessionID
    let cancelled = false
    inFlightToolKeyRef.current = toolKey

    void (async () => {
      try {
        const session = requireBuddyData(
          await getBuddyClient(props.directory).objectWhiteboard.session.read({
            directory: props.directory,
            sessionID,
          }),
        )
        if (cancelled) return
        const target = whiteboardBenchTargetFromSession(session)
        if (!target) return
        await openBench({
          directory: props.directory,
          target,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: whiteboardBenchAutoOpenIdentity(toolKey),
        })
        handledToolKeysRef.current.add(toolKey)
      } catch {
        // Best-effort auto-open should not interrupt transcript streaming.
      } finally {
        if (inFlightToolKeyRef.current === toolKey) {
          inFlightToolKeyRef.current = undefined
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeToolKey, openBench, props.directory, props.sessionID])

  return null
}

export {
  WhiteboardBenchAutoOpen,
  shouldStartWhiteboardBenchAutoOpen,
  whiteboardBenchAutoOpenIdentity,
  whiteboardBenchTargetFromSession,
}
