import { useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { encodeDirectory } from "@/lib/directory-token"
import type { MessageWithParts } from "@/state/chat-types"
import { readLatestActiveWhiteboardCreateKey } from "./whiteboard-progressive"
import {
  clearSuppressedWhiteboardAutoOpen,
  readSuppressedWhiteboardAutoOpenKey,
} from "./whiteboard-auto-open-state"

type WhiteboardAutoOpenProps = {
  directory: string
  messages: MessageWithParts[]
}

const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard" as const

function shouldAutoOpenWhiteboard(input: {
  activeToolKey: string | undefined
  pathname: string
  suppressedToolKey: string | undefined
}) {
  if (!input.activeToolKey) return false
  if (input.pathname.endsWith(WHITEBOARD_ROUTE_SUFFIX)) return false
  return input.activeToolKey !== input.suppressedToolKey
}

export function WhiteboardAutoOpen(props: WhiteboardAutoOpenProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeToolKey = useMemo(
    () => readLatestActiveWhiteboardCreateKey(props.messages),
    [props.messages],
  )

  useEffect(() => {
    if (!activeToolKey) {
      clearSuppressedWhiteboardAutoOpen(props.directory)
      return
    }

    const suppressedToolKey = readSuppressedWhiteboardAutoOpenKey(props.directory)
    if (
      !shouldAutoOpenWhiteboard({
        activeToolKey,
        pathname: location.pathname,
        suppressedToolKey,
      })
    ) {
      return
    }

    if (suppressedToolKey !== undefined) {
      clearSuppressedWhiteboardAutoOpen(props.directory)
    }

    void navigate({
      to: "/$directory/whiteboard",
      params: {
        directory: encodeDirectory(props.directory),
      },
    })
  }, [activeToolKey, location.pathname, navigate, props.directory])

  return null
}

export { shouldAutoOpenWhiteboard }
