import { memo } from "react"
import { language } from "@/context/language"
import { HighlightedText } from "../highlighted-text"
import { CopyAction } from "../copy-action"
import { Button, cn } from "@buddy/ui"
import { formatTime, titleCase } from "../utils/format"
import type { MessageInfo, MessagePart, ProviderInfo } from "@/state/chat-types"

interface UserMessagePartProps {
  part: MessagePart
  info: MessageInfo
  references: MessagePart[]
  agents: MessagePart[]
  providers?: ProviderInfo[]
  queued?: boolean
  onForkMessage?: () => Promise<void> | void
  onRevertMessage?: () => Promise<void> | void
}

function getModelLabel(info: MessageInfo, providers?: ProviderInfo[]): string {
  const providerID = "providerID" in info ? info.providerID : undefined
  const modelID = "modelID" in info ? info.modelID : info.model?.modelID

  if (providerID && modelID && providers) {
    const match = providers.find((p) => p.id === providerID)
    const models = match?.models
    if (models && modelID in models) {
      const entry = models[modelID as keyof typeof models]
      if (entry && typeof entry === "object" && "name" in entry && entry.name) {
        return String(entry.name)
      }
    }
  }

  return modelID ?? ""
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
  if (prevProps.providers !== nextProps.providers) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false

  return true
}

export const UserMessagePart = memo(function UserMessagePart({
  part,
  info,
  references,
  agents,
  providers,
  queued,
  onForkMessage,
  onRevertMessage,
}: UserMessagePartProps) {
  if (part.type !== "text") return null
  if (part.synthetic === true) return null

  const text = String(part.text ?? "")
  if (!text.trim()) return null

  const agent = "agent" in info ? info.agent : undefined
  const metaHead = [titleCase(agent), getModelLabel(info, providers)]
    .filter((value) => !!value)
    .join("\u00A0\u00B7\u00A0")
  const metaTail = formatTime(info.time?.created)

  return (
    <>
      <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col items-end">
        <div
          className={cn(
            "inline-block max-w-full rounded-md border border-border-weak-base bg-surface-base px-3 py-2 whitespace-pre-wrap break-words text-sm",
            queued && "opacity-60",
          )}
        >
          <HighlightedText text={text} references={references} agents={agents} />
        </div>
        {queued && (
          <div className="mt-1.5 mr-0.5 text-xs text-text-weak">
            <span className="animate-pulse">{language.t("chat.userMessage.queued")}</span>
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
            {language.t("chat.userMessage.fork")}
          </Button>
        ) : null}
        {onRevertMessage ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void onRevertMessage()}
          >
            {language.t("chat.userMessage.revert")}
          </Button>
        ) : null}
        <CopyAction value={text} label={language.t("chat.userMessage.copyMessage")} />
      </div>
    </>
  )
}, userMessagePartEqual)
