import { memo, useLayoutEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import { HighlightedText } from "../highlighted-text"
import { CopyAction } from "../copy-action"
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@buddy/ui"
import { Undo2Icon } from "@/icons/app-icons"
import type { MessageInfo, ProviderInfo } from "@/state/chat-types"
import type { ChatAgentPart, ChatFilePart, ChatTextPart } from "../utils/part-guards"

// Collapsed height cap for a long sent message. Anything taller gets clamped
// behind a fade with a "Show more" toggle instead of running full-length.
const COLLAPSED_MAX_HEIGHT_PX = 260
// Only clamp when there's enough hidden to be worth a toggle (don't add a
// "Show more" that reveals a sliver).
const CLAMP_REVEAL_THRESHOLD_PX = 40

type UserMessagePartProps = {
  part: ChatTextPart
  info: MessageInfo
  references: ChatFilePart[]
  agents: ChatAgentPart[]
  inlineReferences?: string[]
  providers?: ProviderInfo[]
  queued?: boolean
  onRevertMessage?: () => Promise<void> | void
}

function userMessagePartEqual(
  prevProps: UserMessagePartProps,
  nextProps: UserMessagePartProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.queued !== nextProps.queued) return false
  if (prevProps.part.text !== nextProps.part.text) return false
  if (prevProps.part.synthetic !== nextProps.part.synthetic) return false

  // Compare info (shallow comparison of key fields)
  const prevTime = prevProps.info.time?.created
  const nextTime = nextProps.info.time?.created
  if (prevTime !== nextTime) return false

  // Compare arrays by reference (they're memoized in parent)
  if (prevProps.references !== nextProps.references) return false
  if (prevProps.agents !== nextProps.agents) return false
  if (prevProps.inlineReferences !== nextProps.inlineReferences) return false
  if (prevProps.providers !== nextProps.providers) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false

  return true
}

export const UserMessagePart = memo(function UserMessagePart({
  part,
  info: _info,
  references,
  agents,
  inlineReferences,
  providers: _providers,
  queued,
  onRevertMessage,
}: UserMessagePartProps) {
  const [reverting, setReverting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // `measured` gates the fade/toggle so they never flash for a short message
  // before the first measurement lands.
  const [metrics, setMetrics] = useState({ measured: false, overflowing: false, fullHeight: 0 })
  const contentRef = useRef<HTMLDivElement>(null)
  // Height only animates (via a CSS max-height transition) once the user has
  // actually toggled. On mount the clamp is applied synchronously with no
  // transition, so it never fights the transcript virtualiser, which measures
  // each row's height on layout.
  const hasToggledRef = useRef(false)

  const text = part.text

  // Measure before paint (useLayoutEffect, not useEffect) so the collapsed
  // height is committed on the first frame. Only push state when the numbers
  // actually change, so the ResizeObserver can't drive a re-render loop.
  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return
    const measure = () => {
      const fullHeight = node.scrollHeight
      const overflowing = fullHeight > COLLAPSED_MAX_HEIGHT_PX + CLAMP_REVEAL_THRESHOLD_PX
      setMetrics((prev) =>
        prev.measured && prev.overflowing === overflowing && prev.fullHeight === fullHeight
          ? prev
          : { measured: true, overflowing, fullHeight },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  if (part.synthetic === true) return null
  if (!text.trim()) return null

  const { measured, overflowing, fullHeight } = metrics
  const clamped = overflowing && !expanded
  // Cap at the collapsed height even before the first measurement: it's a no-op
  // for short messages (they're already shorter) and means a long message is
  // measured at ~260px by the virtualiser instead of momentarily full-height.
  const maxHeight = !measured || clamped ? COLLAPSED_MAX_HEIGHT_PX : overflowing ? fullHeight : null
  // Transition only after a real toggle — never on the initial clamp or a
  // re-measure — so mounting a chat never animates row heights.
  const animateHeight = hasToggledRef.current

  function handleToggleExpanded() {
    hasToggledRef.current = true
    setExpanded((value) => !value)
  }

  async function handleRevertClick() {
    if (!onRevertMessage || reverting) return

    setReverting(true)
    try {
      await onRevertMessage()
    } finally {
      setReverting(false)
    }
  }

  return (
    <>
      <div className="ml-auto flex w-fit max-w-[min(82%,64ch)] flex-col items-end">
        <div
          className={cn(
            "composer-surface-bubble composer-grain relative inline-block max-w-full overflow-hidden",
            queued && "opacity-60",
          )}
        >
          <div className="relative">
            <div
              ref={contentRef}
              className={cn(
                "overflow-hidden px-4 py-3 whitespace-pre-wrap break-words text-sm",
                animateHeight &&
                  "transition-[max-height] duration-300 ease-out motion-reduce:transition-none",
              )}
              style={maxHeight === null ? undefined : { maxHeight }}
            >
              <HighlightedText
                text={text}
                references={references}
                agents={agents}
                inlineReferences={inlineReferences}
              />
            </div>
            {overflowing && (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-14",
                  clamped ? "opacity-100" : "opacity-0",
                  animateHeight && "transition-opacity duration-200 motion-reduce:transition-none",
                )}
                style={{
                  background:
                    "linear-gradient(to top, var(--composer-surface-bg-floating), transparent)",
                }}
              />
            )}
          </div>
          {overflowing && (
            <button
              type="button"
              onClick={handleToggleExpanded}
              className="relative z-[3] px-4 pb-2.5 pt-1 text-left text-xs font-medium text-text-weak transition-colors hover:text-text-base"
            >
              {expanded
                ? language.t("chat.userMessage.showLess")
                : language.t("chat.userMessage.showMore")}
            </button>
          )}
        </div>
        {queued && (
          <div className="mt-1.5 mr-0.5 text-xs text-text-weak">
            <span className="animate-pulse">{language.t("chat.userMessage.queued")}</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-6 w-full items-center justify-end gap-2.5 text-text-weaker opacity-0 pointer-events-none transition-opacity group-hover/user:opacity-100 group-hover/user:pointer-events-auto group-focus-within/user:opacity-100 group-focus-within/user:pointer-events-auto">
        {onRevertMessage ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              disabled={reverting}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation()
                void handleRevertClick()
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-weak hover:text-text-base disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={language.t("chat.userMessage.undoMessage")}
            >
              <Undo2Icon className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <p>{language.t("chat.userMessage.undoMessage")}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <CopyAction value={text} label={language.t("chat.userMessage.copyMessage")} />
      </div>
    </>
  )
}, userMessagePartEqual)
