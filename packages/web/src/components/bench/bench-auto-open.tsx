import { useEffect, useMemo, useRef } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { openBench } from "@/lib/bench-navigation"
import type { MessageWithParts } from "@/state/chat-types"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  readLatestBenchAutoOpenCandidate,
  shouldAutoOpenBenchCandidate,
} from "./bench-open-policy"
import {
  clearSuppressedBenchAutoOpen,
  readSuppressedBenchAutoOpenKey,
  suppressBenchAutoOpen,
} from "./bench-auto-open-state"

type BenchAutoOpenProps = {
  directory: string
  messages: MessageWithParts[]
}

export function BenchAutoOpen(props: BenchAutoOpenProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const didHandleInitialCandidateRef = useRef(false)
  const candidate = useMemo(
    () => readLatestBenchAutoOpenCandidate(props.messages),
    [props.messages],
  )

  useEffect(() => {
    if (!candidate) {
      clearSuppressedBenchAutoOpen(props.directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD)
      didHandleInitialCandidateRef.current = true
      return
    }

    if (
      !didHandleInitialCandidateRef.current &&
      candidate.policyID === BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET
    ) {
      didHandleInitialCandidateRef.current = true
      suppressBenchAutoOpen(props.directory, candidate.policyID, candidate.key)
      return
    }

    didHandleInitialCandidateRef.current = true

    const suppressedKey = readSuppressedBenchAutoOpenKey(props.directory, candidate.policyID)
    if (
      !shouldAutoOpenBenchCandidate({
        candidate,
        pathname: location.pathname,
        suppressedKey,
      })
    ) {
      return
    }

    if (suppressedKey !== undefined) {
      clearSuppressedBenchAutoOpen(props.directory, candidate.policyID)
    }

    void navigate(openBench(props.directory, candidate.target, { chatLayout: candidate.chatLayout }))
  }, [candidate, location.pathname, navigate, props.directory])

  return null
}
