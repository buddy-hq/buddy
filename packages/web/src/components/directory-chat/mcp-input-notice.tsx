import { Button, Card, CardContent, CardFooter, CardHeader } from "@buddy/ui"
import type { ReactElement } from "react"
import { useChatStore } from "@/state/chat-store"

type McpInputNoticeProps = {
  sessionID: string | undefined
  isRunning: boolean
  onStop: () => void
}

export function McpInputNotice(props: McpInputNoticeProps): ReactElement | null {
  const requests = useChatStore((state) => state.pendingMcpInputRequests)
  const sessionID = props.sessionID
  if (!props.isRunning || !sessionID) return null
  const matching = Object.values(requests).filter((request) =>
    request.candidates.some((call) => call.sessionID === sessionID),
  )
  if (matching.length === 0) return null
  return (
    <>
      {matching.map((request) => (
        <div key={request.requestID} className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
          <Card role="alert" aria-live="assertive" className="gap-0 py-0">
            <CardHeader className={request.message ? "pb-4 pt-4" : "py-4"}>
              <p>
                <strong>{request.server}</strong> may be waiting for your input, which Buddy can't
                show yet.
              </p>
            </CardHeader>
            {request.message ? (
              <CardContent className="flex flex-col gap-2 px-4 pb-4 pt-0">
                <blockquote className="whitespace-pre-wrap break-words text-xs text-text-weak">
                  “{request.message}”
                </blockquote>
              </CardContent>
            ) : null}
            <CardFooter className="flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={props.onStop}>
                Stop
              </Button>
            </CardFooter>
          </Card>
        </div>
      ))}
    </>
  )
}
