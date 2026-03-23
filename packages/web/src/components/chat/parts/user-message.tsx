import { memo } from "react"
import { HighlightedText } from "../shared/highlighted-text"
import { CopyAction } from "../shared/copy-action"
import { titleCase } from "../shared/utils"
import { Button, cn } from "@buddy/ui"
import { formatTime } from "../shared/utils"
import type { MessageInfo, MessagePart } from "@/state/chat-types"

interface UserMessagePartProps {
  part: MessagePart
  info: MessageInfo
  references: MessagePart[]
  agents: MessagePart[]
  queued?: boolean
  onForkMessage?: () => Promise<void> | void
  onRevertMessage?: () => Promise<void> | void
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

function userMessagePartEqual(
  prevProps: UserMessagePartProps,
  nextProps: UserMessagePartProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.queued !== nextProps.queued) return false
  if (prevProps.part.type !== "text" || nextProps.part.type !== "text") return false
  if (prevProps.part.text !== nextProps.part.text) return false
  if (prevProps.part.synthetic !== nextProps.part.synthetic) return false

  // Compare info (shallow comparison of key fields)
  const prevAgent = "agent" in prevProps.info ? prevProps.info.agent : undefined
  const nextAgent = "agent" in nextProps.info ? nextProps.info.agent : undefined
  if (prevAgent !== nextAgent) return false

  const prevTime = prevProps.info.time?.created
  const nextTime = nextProps.info.time?.created
  if (prevTime !== nextTime) return false

  // Compare arrays by reference (they're memoized in parent)
  if (prevProps.references !== nextProps.references) return false
  if (prevProps.agents !== nextProps.agents) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false

  return true
}

export const UserMessagePart = memo(function UserMessagePart({
  part,
  info,
  references,
  agents,
  queued,
  onForkMessage,
  onRevertMessage,
}: UserMessagePartProps) {
  if (part.type !== "text") return null
  if (part.synthetic === true) return null

  const text = String(part.text ?? "")
  if (!text.trim()) return null

  const agent = "agent" in info ? info.agent : undefined
  const metaHead = [titleCase(agent), modelLabel(info)]
    .filter((value) => !!value)
    .join("\u00A0\u00B7\u00A0")
  const metaTail = formatTime(info.time?.created)

  return (
    <>
      <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col items-end">
        <div
          className={cn(
            "inline-block max-w-full rounded-md border border-border-base bg-background-base px-3 py-2 whitespace-pre-wrap break-words",
            queued && "opacity-60",
          )}
        >
          <HighlightedText text={text} references={references} agents={agents} />
        </div>
        {queued && (
          <div className="mt-1.5 mr-0.5 text-xs text-text-weak">
            <span className="animate-pulse">Queued</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-6 w-full items-center justify-end gap-2.5 opacity-0 pointer-events-none transition-opacity group-hover/user:opacity-100 group-hover/user:pointer-events-auto group-focus-within/user:opacity-100 group-focus-within/user:pointer-events-auto">
        {(metaHead || metaTail) && (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
            {metaHead && <span className="truncate text-xs text-text-weak">{metaHead}</span>}
            {metaHead && metaTail && (
              <span className="text-xs text-text-weak">{"\u00A0\u00B7\u00A0"}</span>
            )}
            {metaTail && (
              <span className="shrink-0 whitespace-nowrap text-xs text-text-weak">{metaTail}</span>
            )}
          </span>
        )}
        {onForkMessage ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void onForkMessage()}
          >
            Fork
          </Button>
        ) : null}
        {onRevertMessage ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void onRevertMessage()}
          >
            Revert
          </Button>
        ) : null}
        <CopyAction value={text} label="Copy message" />
      </div>
    </>
  )
}, userMessagePartEqual)
