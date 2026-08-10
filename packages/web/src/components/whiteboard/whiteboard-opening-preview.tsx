import { useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import type { MessageWithParts } from "@/state/chat-types"
import {
  TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  useTransientBenchSurface,
  type WhiteboardOpeningTransientBenchSurface,
} from "@/components/bench/transient-bench-surface"
import { readLatestActiveWhiteboardCreate } from "./whiteboard-progressive"
import { useLiveWhiteboardMessages } from "./whiteboard-live-messages"
import { WhiteboardPane } from "./whiteboard-pane"

type WhiteboardOpeningPreviewProps = {
  directory: string
  sessionID?: string
  messages: MessageWithParts[]
}

function WhiteboardOpeningPreview(props: WhiteboardOpeningPreviewProps) {
  const transientBench = useTransientBenchSurface()
  const messages = useLiveWhiteboardMessages(props.messages)
  const activeTool = useMemo(() => readLatestActiveWhiteboardCreate(messages), [messages])
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

  useEffect(() => {
    if (!previewSurface || !transientOpen || !transientClose) return
    transientOpen(previewSurface)
    return () => {
      transientClose(previewSurface)
    }
  }, [previewSurface, transientClose, transientOpen])

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

export { WhiteboardOpeningPreview }
