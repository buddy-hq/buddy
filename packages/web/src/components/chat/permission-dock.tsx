import { useState } from "react"
import { Button } from "@buddy/ui"
import type { PermissionRequest } from "@/state/chat-types"

type PermissionDockProps = {
  request: PermissionRequest
  pendingCount?: number
  onReply: (reply: "once" | "always" | "reject") => Promise<void>
}

const TOOL_HINT: Record<string, string> = {
  read: "Read files from your notebook.",
  list: "List files and directories.",
  glob: "Search files by glob pattern.",
  grep: "Search file contents by pattern.",
  write: "Write or replace files in your notebook.",
  edit: "Edit sections of files.",
  apply_patch: "Apply structured code patches.",
  bash: "Run shell commands.",
  task: "Delegate work to a sub-agent.",
  webfetch: "Fetch content from URLs.",
  curriculum_update: "Update the generated learning plan.",
}

export function PermissionDock(props: PermissionDockProps) {
  const [responding, setResponding] = useState(false)
  const hint = TOOL_HINT[props.request.permission]

  async function onDecide(reply: "once" | "always" | "reject") {
    if (responding) return
    setResponding(true)
    try {
      await props.onReply(reply)
    } finally {
      setResponding(false)
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--chart-3)_40%,var(--border))] bg-[color-mix(in_oklab,var(--card)_94%,var(--chart-3)_6%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--chart-3)_14%,transparent)]"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col gap-[0.55rem] px-[0.8rem] py-[0.7rem] pb-[0.4rem]">
        <div className="grid grid-cols-[1.1rem_1fr] items-center gap-x-[0.55rem]">
          <span
            className="inline-flex size-[1.1rem] items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--chart-3)_28%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)] text-[0.72rem] font-bold text-chart-3"
            aria-hidden="true"
          >
            !
          </span>
          <div className="text-[0.87rem] font-semibold text-foreground">Permission required</div>
        </div>

        {hint ? (
          <div className="grid grid-cols-[1.1rem_1fr] items-start gap-x-[0.55rem]">
            <span aria-hidden="true" />
            <div className="text-[0.8rem] text-muted-foreground">{hint}</div>
          </div>
        ) : null}

        <div className="grid grid-cols-[1.1rem_1fr] items-start gap-x-[0.55rem]">
          <span aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-[0.4rem]">
            <div className="text-[0.82rem] text-foreground">Tool: {props.request.permission}</div>
            {props.request.patterns.length > 0 ? (
              <div className="flex max-h-32 flex-col gap-[0.3rem] overflow-auto">
                {props.request.patterns.map((pattern) => (
                  <code
                    key={`${props.request.id}:${pattern}`}
                    className="whitespace-pre-wrap break-words text-[0.74rem] text-muted-foreground"
                  >
                    {pattern}
                  </code>
                ))}
              </div>
            ) : null}
            {(props.pendingCount ?? 0) > 0 ? (
              <div className="text-[0.72rem] text-muted-foreground">
                +{props.pendingCount} more pending request
                {(props.pendingCount ?? 0) === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[color-mix(in_oklab,var(--border)_75%,transparent)] px-[0.65rem] py-[0.45rem]">
        <div />
        <div className="flex items-center gap-[0.45rem]">
          <Button
            variant="ghost"
            size="sm"
            disabled={responding}
            onClick={() => void onDecide("reject")}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={responding}
            onClick={() => void onDecide("always")}
          >
            Allow always
          </Button>
          <Button size="sm" disabled={responding} onClick={() => void onDecide("once")}>
            Allow once
          </Button>
        </div>
      </div>
    </div>
  )
}
