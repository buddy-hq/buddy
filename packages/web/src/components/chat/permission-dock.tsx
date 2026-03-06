import { useState } from "react"
import { Button } from "@buddy/ui"
import type { PermissionRequest } from "@/state/chat-types"
import "./permission-dock.css"

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
    <div className="buddy-permission-dock" role="alert" aria-live="assertive">
      <div className="buddy-permission-body">
        <div className="buddy-permission-row buddy-permission-row-header">
          <span className="buddy-permission-icon" aria-hidden="true">
            !
          </span>
          <div className="buddy-permission-header-title">Permission required</div>
        </div>

        {hint ? (
          <div className="buddy-permission-row">
            <span className="buddy-permission-spacer" aria-hidden="true" />
            <div className="buddy-permission-hint">{hint}</div>
          </div>
        ) : null}

        <div className="buddy-permission-row">
          <span className="buddy-permission-spacer" aria-hidden="true" />
          <div className="buddy-permission-main">
            <div className="buddy-permission-label">Tool: {props.request.permission}</div>
            {props.request.patterns.length > 0 ? (
              <div className="buddy-permission-patterns">
                {props.request.patterns.map((pattern) => (
                  <code key={`${props.request.id}:${pattern}`}>{pattern}</code>
                ))}
              </div>
            ) : null}
            {(props.pendingCount ?? 0) > 0 ? (
              <div className="buddy-permission-remaining">
                +{props.pendingCount} more pending request{(props.pendingCount ?? 0) === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="buddy-permission-footer">
        <div />
        <div className="buddy-permission-actions">
          <Button variant="ghost" size="sm" disabled={responding} onClick={() => void onDecide("reject")}>
            Reject
          </Button>
          <Button variant="secondary" size="sm" disabled={responding} onClick={() => void onDecide("always")}>
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
