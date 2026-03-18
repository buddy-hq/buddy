import { HighlightedText } from "../shared/highlighted-text"
import { CopyAction } from "../shared/copy-action"
import { useThrottledText } from "../shared/hooks"
import { titleCase } from "../shared/utils"
import { cn } from "@buddy/ui"
import { formatTime } from "../shared/utils"
import type { MessageInfo, MessagePart } from "@/state/chat-types"

interface UserMessagePartProps {
  part: MessagePart
  info: MessageInfo
  references: MessagePart[]
  agents: MessagePart[]
  queued?: boolean
}

function modelLabel(info: MessageInfo): string {
  if ("modelID" in info && info.modelID) {
    return info.modelID
  }
  if ("model" in info && info.model?.modelID) {
    return info.model.modelID
  }
  return ""
}

export function UserMessagePart({ part, info, references, agents, queued }: UserMessagePartProps) {
  if (part.type !== "text") return null
  if (part.synthetic === true) return null

  const text = String(part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  const agent = "agent" in info ? info.agent : undefined
  const metaHead = [titleCase(agent), modelLabel(info)].filter((value) => !!value).join("\u00A0\u00B7\u00A0")
  const metaTail = formatTime(info.time?.created)

  return (
    <>
      <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col items-end">
        <div
          className={cn(
            "inline-block max-w-full rounded-md border border-border bg-background px-3 py-2 whitespace-pre-wrap break-words",
            queued && "opacity-60",
          )}
        >
          <HighlightedText text={throttledText} references={references} agents={agents} />
        </div>
        {queued && (
          <div className="mt-1.5 mr-0.5 text-xs text-muted-foreground">
            <span className="animate-pulse">Queued</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-6 w-full items-center justify-end gap-2.5 opacity-0 pointer-events-none transition-opacity group-hover/user:opacity-100 group-hover/user:pointer-events-auto group-focus-within/user:opacity-100 group-focus-within/user:pointer-events-auto">
        {(metaHead || metaTail) && (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
            {metaHead && <span className="truncate text-xs text-muted-foreground">{metaHead}</span>}
            {metaHead && metaTail && <span className="text-xs text-muted-foreground">{"\u00A0\u00B7\u00A0"}</span>}
            {metaTail && <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{metaTail}</span>}
          </span>
        )}
        <CopyAction value={text} label="Copy message" />
      </div>
    </>
  )
}
