import { useState } from "react"
import { Button } from "@buddy/ui"
import { language } from "@/context/language"
import type { PermissionRequest } from "@/state/chat-types"

type PermissionDockProps = {
  request: PermissionRequest
  pendingCount?: number
  onReply: (reply: "once" | "always" | "reject") => Promise<void>
}

const TOOL_HINT: Record<string, string> = {
  read: language.t("chat.permissionDock.toolHint.read"),
  list: language.t("chat.permissionDock.toolHint.list"),
  glob: language.t("chat.permissionDock.toolHint.glob"),
  grep: language.t("chat.permissionDock.toolHint.grep"),
  write: language.t("chat.permissionDock.toolHint.write"),
  edit: language.t("chat.permissionDock.toolHint.edit"),
  apply_patch: language.t("chat.permissionDock.toolHint.applyPatch"),
  bash: language.t("chat.permissionDock.toolHint.bash"),
  task: language.t("chat.permissionDock.toolHint.task"),
  webfetch: language.t("chat.permissionDock.toolHint.webfetch"),
  curriculum_update: language.t("chat.permissionDock.toolHint.curriculumUpdate"),
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
      className="flex flex-col overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--surface-warning-base)_40%,var(--border-base))] bg-[color-mix(in_oklab,var(--surface-raised-base)_94%,var(--surface-warning-base)_6%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--surface-warning-base)_14%,transparent)]"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col gap-[0.55rem] px-[0.8rem] py-[0.7rem] pb-[0.4rem]">
        <div className="grid grid-cols-[1.1rem_1fr] items-center gap-x-[0.55rem]">
          <span
            className="inline-flex size-[1.1rem] items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--surface-warning-base)_28%,transparent)] bg-[color-mix(in_oklab,var(--surface-warning-base)_16%,transparent)] text-[0.72rem] font-bold text-icon-warning-base"
            aria-hidden="true"
          >
            !
          </span>
          <div className="text-[0.87rem] font-semibold text-text-base">
            {language.t("chat.permissionDock.permissionRequired")}
          </div>
        </div>

        {hint ? (
          <div className="grid grid-cols-[1.1rem_1fr] items-start gap-x-[0.55rem]">
            <span aria-hidden="true" />
            <div className="text-[0.8rem] text-text-weak">{hint}</div>
          </div>
        ) : null}

        <div className="grid grid-cols-[1.1rem_1fr] items-start gap-x-[0.55rem]">
          <span aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-[0.4rem]">
            <div className="text-[0.82rem] text-text-base">
              {language.t("chat.permissionDock.toolLabel")}: {props.request.permission}
            </div>
            {props.request.patterns.length > 0 ? (
              <div className="flex max-h-32 flex-col gap-[0.3rem] overflow-auto">
                {props.request.patterns.map((pattern) => (
                  <code
                    key={`${props.request.id}:${pattern}`}
                    className="whitespace-pre-wrap break-words text-[0.74rem] text-text-weak"
                  >
                    {pattern}
                  </code>
                ))}
              </div>
            ) : null}
            {(props.pendingCount ?? 0) > 0 ? (
              <div className="text-[0.72rem] text-text-weak">
                {language.t(
                  (props.pendingCount ?? 0) === 1
                    ? "chat.permissionDock.pendingRequests.one"
                    : "chat.permissionDock.pendingRequests.other",
                  { count: props.pendingCount ?? 0 },
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[color-mix(in_oklab,var(--border-base)_75%,transparent)] px-[0.65rem] py-[0.45rem]">
        <div />
        <div className="flex items-center gap-[0.45rem]">
          <Button
            variant="ghost"
            size="sm"
            disabled={responding}
            onClick={() => void onDecide("reject")}
          >
            {language.t("chat.permissionDock.reject")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={responding}
            onClick={() => void onDecide("always")}
          >
            {language.t("chat.permissionDock.allowAlways")}
          </Button>
          <Button size="sm" disabled={responding} onClick={() => void onDecide("once")}>
            {language.t("chat.permissionDock.allowOnce")}
          </Button>
        </div>
      </div>
    </div>
  )
}
