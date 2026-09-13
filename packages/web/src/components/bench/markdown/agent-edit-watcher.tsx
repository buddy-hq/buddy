import { useEffect, useMemo, useRef } from "react"
import { markdownBenchAgentEditActivity } from "@/components/bench/markdown/agent-edits"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"

export function MarkdownBenchAgentEditWatcher(props: {
  directory: string
  sessionID: string | undefined
  path: string
  onSettled(): void
}): null {
  const messages = useTranscriptSessionMessages(props.directory, props.sessionID)
  const activity = useMemo(
    () => markdownBenchAgentEditActivity(messages, props.path),
    [messages, props.path],
  )
  const handledKeyRef = useRef<string | undefined>(undefined)
  const onSettledRef = useRef(props.onSettled)

  useEffect(() => {
    onSettledRef.current = props.onSettled
  }, [props.onSettled])

  useEffect(() => {
    if (activity.running) return
    if (!activity.completedKey || handledKeyRef.current === activity.completedKey) return
    handledKeyRef.current = activity.completedKey
    onSettledRef.current()
  }, [activity.completedKey, activity.running])

  return null
}
