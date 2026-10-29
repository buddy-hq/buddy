import { useEffect } from "react"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { useKeyedMediaState } from "./use-keyed-media-state"
import { useChatStore } from "@/state/chat-store"

type WidgetFrameLink =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" }

export function useWidgetFrameLink(runtimeUrl: string, reloadKey = 0): WidgetFrameLink {
  const connectionRevision = useChatStore((state) => state.streamConnectionRevision)
  const key = JSON.stringify([runtimeUrl, reloadKey])
  const [link, setLink] = useKeyedMediaState<WidgetFrameLink>(key, { status: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void getBuddyClient()
      .widgetFrame.exchange({ runtimeUrl }, { signal: controller.signal })
      .then((result) => {
        const { url } = requireBuddyData(result)
        if (active) setLink({ status: "ready", url })
      })
      .catch(() => {
        if (active) setLink({ status: "error" })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [runtimeUrl, reloadKey, connectionRevision, setLink])

  return link
}
