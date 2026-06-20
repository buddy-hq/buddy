import { useEffect, useMemo, useRef } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  BENCH_MODE_REQUEST_POLICY,
  readBenchOpenPolicyStateFromLocation,
  useOpenBench,
} from "@/lib/bench-navigation"
import { guardBenchLeaveBeforeNavigation } from "@/lib/bench-leave-guard"
import {
  closeBenchWorkspace,
  waitForBenchRightWorkspaceCollapse,
} from "@/lib/close-bench-workspace"
import { encodeDirectory } from "@/lib/directory-token"
import type { MessageWithParts } from "@/state/chat-types"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  readLatestBenchAction,
  readLatestActiveWhiteboardAutoOpen,
  readLatestBenchAutoOpenCandidate,
  resolveBenchAutoOpenSuppressions,
} from "./bench-open-policy"
import { clearSuppressedBenchAutoOpen, suppressBenchAutoOpen } from "@/lib/bench-auto-open-state"
import { useUiPreferences } from "@/state/ui-preferences"
import { whiteboardSessionQueryOptions } from "@/components/whiteboard/whiteboard-query"

type BenchAutoOpenProps = {
  directory: string
  messages: MessageWithParts[]
}

export function BenchAutoOpen(props: BenchAutoOpenProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const openBenchRoute = useOpenBench()
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const closeRightWorkspace = useUiPreferences((state) => state.closeRightWorkspace)
  const previousRightSidebarOpenRef = useRef(rightSidebarOpen)
  const didHandleInitialCandidateRef = useRef(false)
  const didHandleInitialPresentationActionRef = useRef(false)
  const handledPresentationActionKeysRef = useRef(new Set<string>())
  const candidate = useMemo(
    () => readLatestBenchAutoOpenCandidate(props.messages),
    [props.messages],
  )
  const activeWhiteboard = useMemo(
    () => readLatestActiveWhiteboardAutoOpen(props.messages),
    [props.messages],
  )
  const activeWhiteboardEventKey = activeWhiteboard?.eventKey
  const activeWhiteboardSessionID = activeWhiteboard?.sessionID
  const presentationAction = useMemo(() => readLatestBenchAction(props.messages), [props.messages])

  useEffect(() => {
    const wasOpen = previousRightSidebarOpenRef.current
    previousRightSidebarOpenRef.current = rightSidebarOpen
    const suppressions = resolveBenchAutoOpenSuppressions({
      workspaceWasOpen: wasOpen,
      workspaceOpen: rightSidebarOpen,
      activeWhiteboard,
      candidate,
    })
    for (const suppression of suppressions) {
      suppressBenchAutoOpen(props.directory, suppression.policyID, suppression.eventKey)
    }
  }, [activeWhiteboard, candidate, props.directory, rightSidebarOpen])

  // Managed-object result metadata arrives after tool input generation. Resolve the session
  // object from the pending part so Bench opens when that generation begins.
  useEffect(() => {
    if (!activeWhiteboardEventKey || !activeWhiteboardSessionID) return

    let cancelled = false
    void queryClient
      .fetchQuery(whiteboardSessionQueryOptions(props.directory, activeWhiteboardSessionID))
      .then((session) => {
        if (cancelled || !session.objectID) return

        return openBenchRoute({
          directory: props.directory,
          target: {
            type: "object",
            ref: {
              kind: "whiteboard",
              objectID: session.objectID,
              revisionID: null,
              itemID: null,
            },
            viewID: "current",
          },
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: activeWhiteboardEventKey,
          },
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [
    activeWhiteboardEventKey,
    activeWhiteboardSessionID,
    openBenchRoute,
    props.directory,
    queryClient,
  ])

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
      void (async () => {
        if (current.status === "open") {
          const guardResult = await guardBenchLeaveBeforeNavigation({
            directory: props.directory,
            intent: "close",
            origin: "agent",
            current: current.target,
            next: null,
          })
          if (guardResult.status === "block") return
        }

        await closeBenchWorkspace({
          closeWorkspace: () => closeRightWorkspace(props.directory),
          waitForWorkspaceCollapse: waitForBenchRightWorkspaceCollapse,
          navigateToChat: () =>
            navigate({
              to: "/$directory/chat",
              params: {
                directory: encodeDirectory(props.directory),
              },
              replace: true,
              viewTransition: false,
            }),
        })
      })()
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
    closeRightWorkspace,
  ])

  useEffect(() => {
    if (!candidate) {
      if (!activeWhiteboard) {
        clearSuppressedBenchAutoOpen(props.directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD)
      }
      clearSuppressedBenchAutoOpen(props.directory, BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET)
      didHandleInitialCandidateRef.current = true
      return
    }

    if (activeWhiteboard && activeWhiteboard.eventKey !== candidate.eventKey) {
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
  }, [activeWhiteboard, candidate, openBenchRoute, props.directory])

  return null
}
