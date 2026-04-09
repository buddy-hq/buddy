import { LoaderCircleIcon } from "lucide-react"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { parseSubagentSession } from "@/lib/session-family"
import { useChatStore } from "@/state/chat-store"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { readString } from "../../tools/types"
import type { ToolPartProps } from "../registry"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"

function TaskStatusIndicator(props: { status: ToolPartProps["state"]["status"] }) {
  if (props.status === "pending" || props.status === "running") {
    return <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-text-weaker" />
  }

  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        props.status === "error" ? "bg-icon-critical-base/70" : "bg-text-interactive-base/60",
      )}
      aria-hidden="true"
    />
  )
}

export function renderTaskTool({ state, onOpenSession, directory }: ToolPartProps) {
  return <TaskToolCard state={state} onOpenSession={onOpenSession} directory={directory} />
}

function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const childSessionID = readString(state.metadata.sessionId)
  const configuredSubagent = readString(state.input.subagent_type)
  const description = readString(state.input.description)?.trim()
  const openChildSession =
    childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0
  const childSession = useChatStore((store) => {
    if (!directory || !childSessionID) return undefined
    return store.directories[directory]?.sessions.find((session) => session.id === childSessionID)
  })
  const parsedSession = childSession ? parseSubagentSession(childSession) : undefined
  const displayTitle =
    parsedSession?.title ||
    description ||
    childSession?.title ||
    language.t("sidebar.untitledThread")
  const displayAgent = parsedSession?.agent || configuredSubagent
  const secondaryLine =
    description && parsedSession?.title && parsedSession.title !== description
      ? description
      : undefined
  const age = childSession
    ? formatThreadAge(childSession.time.updated ?? childSession.time.created)
    : undefined

  const cardContent = (
    <div
      className={cn(
        "w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left transition-colors",
        openChildSession && state.status !== "error" && "hover:border-border-hover",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <TaskStatusIndicator status={state.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-weaker">
              {language.t("chatTools.task")}
            </span>
            {displayAgent ? (
              <span className="max-w-32 truncate text-xs font-medium text-text-interactive-base">
                {displayAgent}
              </span>
            ) : null}
            {age ? <span className="ml-auto text-[11px] text-text-weaker">{age}</span> : null}
          </div>
          <p className="truncate text-sm text-text-strong">{displayTitle}</p>
          {secondaryLine ? (
            <p className="truncate text-xs text-text-weak">{secondaryLine}</p>
          ) : null}
        </div>
      </div>
      {state.status === "error" && showOutput ? (
        <div className="mt-3">
          <ToolOutputPanel
            output={output}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        </div>
      ) : null}
    </div>
  )

  if (openChildSession && state.status !== "error") {
    return (
      <button type="button" className="w-full text-left" onClick={openChildSession}>
        {cardContent}
      </button>
    )
  }

  return cardContent
}
