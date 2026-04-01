import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { SessionStatusInfo } from "./types"

const RETRY_TICK_INTERVAL_MS = 1000

function secondsUntil(next: number) {
  return Math.max(0, Math.round((next - Date.now()) / 1000))
}

export function SessionRetryNotice(props: { status: SessionStatusInfo }) {
  const retryStatus = props.status.type === "retry" ? props.status : undefined

  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    retryStatus ? secondsUntil(retryStatus.next) : 0,
  )

  useEffect(() => {
    if (!retryStatus) return

    const update = () => {
      setSecondsRemaining(secondsUntil(retryStatus.next))
    }

    update()
    const timer = window.setInterval(update, RETRY_TICK_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [retryStatus])

  if (!retryStatus) return null

  const retryLabel =
    secondsRemaining > 0
      ? `Retrying in ${secondsRemaining}s. Attempt #${retryStatus.attempt}.`
      : `Retrying now. Attempt #${retryStatus.attempt}.`

  return (
    <div
      role="status"
      aria-live="polite"
      data-session-retry-notice=""
      className="w-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
    >
      <div className="flex items-start gap-2">
        <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">{retryStatus.message}</div>
          <div className="mt-1 text-xs text-text-weak">{retryLabel}</div>
        </div>
      </div>
    </div>
  )
}
