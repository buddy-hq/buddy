import { useState, useMemo } from "react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ChevronRightIcon,
  cn,
} from "@buddy/ui"
import { parseToolState } from "../tools/parse-tool-state"
import { getToolInfo } from "../tools/tool-info"
import type { MessagePart } from "@/state/chat-types"

function contextSummary(parts: MessagePart[]) {
  const read = parts.filter((part) => part.tool === "read").length
  const search = parts.filter((part) => part.tool === "glob" || part.tool === "grep").length
  const list = parts.filter((part) => part.tool === "list").length

  const values = [
    read ? `${read} ${read === 1 ? "read" : "reads"}` : undefined,
    search ? `${search} ${search === 1 ? "search" : "searches"}` : undefined,
    list ? `${list} ${list === 1 ? "list" : "lists"}` : undefined,
  ].filter((value): value is string => !!value)

  return values.join(", ")
}

interface ContextToolGroupProps {
  parts: MessagePart[]
}

export function ContextToolGroup({ parts }: ContextToolGroupProps) {
  const states = useMemo(() => parts.map((part) => parseToolState(part)), [parts])
  const [isOpen, setIsOpen] = useState(false)
  const pending = states.some((state) => state.status === "pending" || state.status === "running")
  const summary = contextSummary(parts)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full rounded-lg border border-border-base bg-surface-raised-base p-3"
    >
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 text-left">
          <span className="min-w-0 flex items-center gap-2">
            <span className={cn("shrink-0 font-medium text-text-base", pending && "animate-pulse")}>
              {pending ? "Gathering context" : "Gathered context"}
            </span>
            {summary ? <span className="truncate text-sm text-text-weak">{summary}</span> : null}
          </span>
          <ChevronRightIcon
            className={cn(
              "h-4 w-4 shrink-0 text-text-weak transition-transform",
              isOpen && "rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2">
          {parts.map((part, index) => {
            const state = states[index]
            if (!state) return null
            const info = getToolInfo(String(part.tool ?? ""), state.input)
            const running = state.status === "pending" || state.status === "running"
            return (
              <div key={part.id} className="py-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className={cn("font-medium text-text-base", running && "animate-pulse")}>
                    {info.title}
                  </span>
                  {!running && info.subtitle ? (
                    <span className="truncate text-text-weak">{info.subtitle}</span>
                  ) : null}
                  {!running &&
                    info.args?.map((arg) => (
                      <span
                        key={`${part.id}:${arg}`}
                        className="rounded bg-surface-weak px-1.5 py-0.5 text-xs text-text-weak"
                      >
                        {arg}
                      </span>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
