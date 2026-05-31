import { useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { encodeDirectory } from "@/lib/directory-token"
import type { MessageWithParts } from "@/state/chat-types"
import { hasActiveWhiteboardCreate } from "./whiteboard-progressive"

type WhiteboardAutoOpenProps = {
  directory: string
  messages: MessageWithParts[]
}

const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard" as const

export function WhiteboardAutoOpen(props: WhiteboardAutoOpenProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const shouldOpen = useMemo(
    () => hasActiveWhiteboardCreate(props.messages),
    [props.messages],
  )

  useEffect(() => {
    if (!shouldOpen || location.pathname.endsWith(WHITEBOARD_ROUTE_SUFFIX)) return

    void navigate({
      to: "/$directory/whiteboard",
      params: {
        directory: encodeDirectory(props.directory),
      },
    })
  }, [location.pathname, navigate, props.directory, shouldOpen])

  return null
}
