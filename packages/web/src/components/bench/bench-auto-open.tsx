import { useEffect, useMemo, useRef } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import {
  BENCH_MODE_REQUEST_POLICY,
  readBenchOpenPolicyStateFromLocation,
  useOpenBench,
} from "@/lib/bench-navigation"
import { guardBenchLeaveBeforeNavigation } from "@/lib/bench-leave-guard"
import { encodeDirectory } from "@/lib/directory-token"
import type { MessageWithParts } from "@/state/chat-types"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  readLatestBenchAction,
  readLatestBenchAutoOpenCandidate,
} from "./bench-open-policy"
import {
  clearSuppressedBenchAutoOpen,
  suppressBenchAutoOpen,
} from "@/lib/bench-auto-open-state"
import { useUiPreferences } from "@/state/ui-preferences"

type BenchAutoOpenProps = {
  directory: string
  messages: MessageWithParts[]
}

export function BenchAutoOpen(props: BenchAutoOpenProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const openBenchRoute = useOpenBench()
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const didHandleInitialCandidateRef = useRef(false)
  const didHandleInitialPresentationActionRef = useRef(false)
  const handledPresentationActionKeysRef = useRef(new Set<string>())
  const candidate = useMemo(
    () => readLatestBenchAutoOpenCandidate(props.messages),
    [props.messages],
  )
  const presentationAction = useMemo(
    () => readLatestBenchAction(props.messages),
    [props.messages],
  )

  useEffect(() => {
    if (!presentationAction) {
      didHandleInitialPresentationActionRef.current = true
      return
    }

    if (!didHandleInitialPresentationActionRef.current) {
      didHandleInitialPresentationActionRef.current = true
      handledPresentationActionKeysRef.current.add(presentationAction.eventKey)
      return
    }

    if (handledPresentationActionKeysRef.current.has(presentationAction.eventKey)) {
      return
    }
    handledPresentationActionKeysRef.current.add(presentationAction.eventKey)

    if (presentationAction.action === "close") {
      const current = readBenchOpenPolicyStateFromLocation({
        directory: props.directory,
        pathname: location.pathname,
        search: location.search,
      })
      if (current.status === "open") {
        void guardBenchLeaveBeforeNavigation({
          directory: props.directory,
          intent: "close",
          origin: "agent",
          current: current.target,
          next: null,
        }).then((guardResult) => {
          if (guardResult.status === "block") return
          void navigate({
            to: "/$directory/chat",
            params: {
              directory: encodeDirectory(props.directory),
            },
            replace: true,
          })
          setRightSidebarOpen(false)
        })
        return
      }

      void navigate({
        to: "/$directory/chat",
        params: {
          directory: encodeDirectory(props.directory),
        },
        replace: true,
      })
      setRightSidebarOpen(false)
      return
    }

    void openBenchRoute(
      {
        directory: props.directory,
        target: presentationAction.target,
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      },
      { origin: "agent" },
    )
  }, [
    location.pathname,
    location.search,
    navigate,
    openBenchRoute,
    presentationAction,
    props.directory,
    setRightSidebarOpen,
  ])

  useEffect(() => {
    if (!candidate) {
      clearSuppressedBenchAutoOpen(props.directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD)
      clearSuppressedBenchAutoOpen(
        props.directory,
        BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
      )
      didHandleInitialCandidateRef.current = true
      return
    }

    if (
      !didHandleInitialCandidateRef.current &&
      candidate.policyID === BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET
    ) {
      didHandleInitialCandidateRef.current = true
      suppressBenchAutoOpen(props.directory, candidate.policyID, candidate.eventKey)
      return
    }

    didHandleInitialCandidateRef.current = true

    void openBenchRoute({
      directory: props.directory,
      target: candidate.target,
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: {
        policyID: candidate.policyID,
        eventKey: candidate.eventKey,
      },
    })
  }, [candidate, openBenchRoute, props.directory])

  return null
}
