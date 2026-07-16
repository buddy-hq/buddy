import { Button, cn } from "@buddy/ui"
import { ChevronDownIcon, Loader2Icon, PencilIcon, SendHorizontalIcon } from "@/icons/app-icons"
import { useState } from "react"
import { language } from "@/context/language"

export type QueuedFollowupItem = {
  id: string
  label: string
  description?: string
  sendLabel?: string
  sendDisabled?: boolean
}

type SessionFollowupDockProps = {
  items: QueuedFollowupItem[]
  sendingID?: string
  onSend: (id: string) => void
  onEdit: (id: string) => void
}

export function SessionFollowupDock(props: SessionFollowupDockProps) {
  const [expanded, setExpanded] = useState(true)
  const count = props.items.length
  if (count === 0) return null

  const summary = language.t(
    count === 1 ? "chat.followupDock.summary.one" : "chat.followupDock.summary.other",
    { count },
  )

  return (
    <div className="rounded-md border border-border-base/70 bg-surface-weak/35 px-3 py-2 text-xs text-text-weak">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? language.t("chat.followupDock.collapse")
              : language.t("chat.followupDock.expand")
          }
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              expanded ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate font-medium text-text-base">{summary}</span>
        </button>
        {!expanded && props.items[0] ? (
          <span className="min-w-0 flex-1 truncate text-right">{props.items[0].label}</span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 space-y-1.5">
          {props.items.map((item) => {
            const sending = props.sendingID === item.id
            const queueBusy = props.sendingID !== undefined
            return (
              <div
                key={item.id}
                className="flex min-w-0 items-center gap-2 rounded-md bg-surface-base/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text-base">{item.label}</div>
                  {item.description ? (
                    <div className="mt-0.5 truncate text-text-weak">{item.description}</div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={queueBusy}
                  onClick={() => props.onEdit(item.id)}
                >
                  <PencilIcon className="mr-1 size-3" />
                  {language.t("chat.followupDock.edit")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={queueBusy || item.sendDisabled === true}
                  onClick={() => props.onSend(item.id)}
                >
                  {sending ? (
                    <Loader2Icon className="mr-1 size-3 animate-spin" />
                  ) : (
                    <SendHorizontalIcon className="mr-1 size-3" />
                  )}
                  {item.sendLabel ?? language.t("chat.followupDock.sendNow")}
                </Button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
