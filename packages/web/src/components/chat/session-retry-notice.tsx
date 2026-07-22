import { useEffect, useState } from "react"
import { Button } from "@buddy/ui"
import { ExternalLinkIcon, type AppIcon } from "@/icons/app-icons"
import type { RetryStateModel } from "@/state/chat-error-model"
import "@/components/prompt/composer-surfaces.css"

const RETRY_TICK_INTERVAL_MS = 1000

export type RetryActionID = "switch-model" | "stop" | "open-action"

type RetryStage = "quiet" | "notice" | "persistent"

type RetryAction = {
  id: RetryActionID
  label: string
  primary?: boolean
  icon?: AppIcon
}
type RetryContent = {
  headline: string
  sub: string
  announcement: string
  actions?: RetryAction[]
}

type RetryCategoryCopy = {
  notice: string
  persistent: string
}

type StructuredRetryAction = NonNullable<RetryStateModel["action"]>

const RETRY_COPY_BY_CATEGORY: Record<RetryStateModel["category"], RetryCategoryCopy> = {
  overloaded: {
    notice: "The model provider is busy",
    persistent: "Still busy — this is taking longer than usual",
  },
  "rate-limit": {
    notice: "Hitting the model’s rate limit",
    persistent: "Still rate limited — you can switch models",
  },
  network: {
    notice: "Reconnecting to the model",
    persistent: "Still trying to reconnect",
  },
  unknown: {
    notice: "Retrying the request",
    persistent: "Still retrying — this is taking longer than usual",
  },
}

function secondsUntil(next: number) {
  return Math.max(0, Math.round((next - Date.now()) / 1000))
}

function AmberPulse() {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-icon-warning-base opacity-60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-icon-warning-base" />
    </span>
  )
}

function RetryActions(props: {
  actions: RetryAction[]
  onAction: (action: RetryActionID) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.actions.map((a) => (
        <Button
          key={a.label}
          size="sm"
          variant={a.primary ? "outline" : "ghost"}
          className={a.primary ? undefined : "text-text-weak"}
          onClick={() => props.onAction(a.id)}
        >
          {a.label}
          {a.icon ? <a.icon data-icon="inline-end" aria-hidden /> : null}
        </Button>
      ))}
    </div>
  )
}

function RetrySurface(props: { content: RetryContent; onAction: (action: RetryActionID) => void }) {
  const { content } = props
  const actions = content.actions ?? []

  const line = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex items-center gap-2"
      >
        <AmberPulse />
        <span className="font-medium text-text-strong">{content.headline}</span>
        <span className="sr-only">{content.announcement}</span>
      </span>
      <span className="text-text-weaker" aria-hidden>
        ·
      </span>
      <span className="tabular-nums text-text-weak">{content.sub}</span>
    </div>
  )

  if (actions.length === 0) {
    return <div className="w-full py-1">{line}</div>
  }

  return (
    <div className="composer-surface composer-grain relative w-full overflow-hidden p-3.5">
      {line}
      <div className="mt-3">
        <RetryActions actions={actions} onAction={props.onAction} />
      </div>
    </div>
  )
}

function RetryNotice(props: {
  stage: Exclude<RetryStage, "quiet">
  category: RetryStateModel["category"]
  attempt: number
  seconds: number
  onAction: (action: RetryActionID) => void
}) {
  const persistent = props.stage === "persistent"
  const copy = RETRY_COPY_BY_CATEGORY[props.category]
  return (
    <RetrySurface
      content={{
        headline: persistent ? copy.persistent : copy.notice,
        sub:
          props.seconds > 0
            ? `Trying again in ${props.seconds}s · attempt ${props.attempt}`
            : `Retrying now · attempt ${props.attempt}`,
        announcement: `Retry attempt ${props.attempt}.`,
        actions: persistent
          ? [
              { id: "switch-model", label: "Switch model", primary: true },
              { id: "stop", label: "Stop" },
            ]
          : undefined,
      }}
      onAction={props.onAction}
    />
  )
}

function RetryActionCard(props: {
  action: StructuredRetryAction
  onAction: (action: RetryActionID) => void
}) {
  const actions: RetryAction[] = [{ id: "switch-model", label: "Switch model", primary: true }]
  if (props.action.link) {
    actions.push({ id: "open-action", label: props.action.label, icon: ExternalLinkIcon })
  }

  return (
    <RetrySurface
      content={{
        headline: props.action.title,
        sub: props.action.message,
        announcement: props.action.message,
        actions,
      }}
      onAction={props.onAction}
    />
  )
}

export function SessionRetryNotice(props: {
  model: RetryStateModel
  onAction: (action: RetryActionID) => void
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => secondsUntil(props.model.next))

  useEffect(() => {
    const update = () => {
      setSecondsRemaining(secondsUntil(props.model.next))
    }

    update()
    const timer = window.setInterval(update, RETRY_TICK_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [props.model.next])

  if (props.model.stage === "quiet") return null
  if (props.model.stage === "actionable") {
    if (!props.model.action) return null
    return <RetryActionCard action={props.model.action} onAction={props.onAction} />
  }

  return (
    <RetryNotice
      stage={props.model.stage}
      category={props.model.category}
      attempt={props.model.attempt}
      seconds={secondsRemaining}
      onAction={props.onAction}
    />
  )
}
