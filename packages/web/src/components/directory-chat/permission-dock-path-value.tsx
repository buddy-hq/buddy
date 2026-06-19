import { Button, CheckIcon, CopyIcon, Tooltip, TooltipContent, TooltipTrigger } from "@buddy/ui"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import {
  getPermissionDockPathDisplay,
  type TPermissionDockPathDisplay,
} from "@/lib/permission-dock-path-display"

const PERMISSION_PATH_TOOLTIP_DELAY_MS = 200
const PERMISSION_PATH_COPIED_RESET_MS = 2000

type PermissionDockPathValueProps = {
  path: string
}

function PermissionDockPathSegments(props: { display: TPermissionDockPathDisplay }) {
  if (props.display.kind === "plain") {
    return <span className="text-text-weak">{props.display.path}</span>
  }

  return (
    <>
      <span className="text-text-weak">{props.display.prefix}</span>
      {props.display.interactive ? (
        <>
          <span className="text-text-interactive-base">{props.display.interactive}/</span>
          <span className="font-semibold text-text-interactive-base">{props.display.final}</span>
        </>
      ) : (
        <span className="font-semibold text-text-interactive-base">{props.display.final}</span>
      )}
    </>
  )
}

function useTruncationOverflow(path: string) {
  const truncatorRef = useRef<HTMLSpanElement>(null)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const truncator = truncatorRef.current
    if (!truncator) return

    const measure = () => {
      const inner = truncator.firstElementChild
      if (!(inner instanceof HTMLElement)) {
        setOverflows(false)
        return
      }
      setOverflows(inner.scrollWidth > truncator.clientWidth)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(truncator)
    if (truncator.firstElementChild instanceof HTMLElement) {
      observer.observe(truncator.firstElementChild)
    }

    return () => observer.disconnect()
  }, [path])

  return { truncatorRef, overflows }
}

export function PermissionDockPathValue(props: PermissionDockPathValueProps) {
  const display = getPermissionDockPathDisplay(props.path)
  const { truncatorRef, overflows } = useTruncationOverflow(props.path)
  const showLeadingEllipsis = display.kind === "split" || overflows
  const [copied, setCopied] = useState(false)
  const copiedResetTimeoutRef = useRef<number | undefined>(undefined)

  const onCopyPath = useCallback(async () => {
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(props.path)
      setCopied(true)
      if (copiedResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copiedResetTimeoutRef.current)
      }
      copiedResetTimeoutRef.current = window.setTimeout(
        () => setCopied(false),
        PERMISSION_PATH_COPIED_RESET_MS,
      )
    } catch {
      // ignore clipboard failures
    }
  }, [props.path])

  useLayoutEffect(() => {
    return () => {
      if (copiedResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copiedResetTimeoutRef.current)
      }
    }
  }, [])

  return (
    <Tooltip delayDuration={PERMISSION_PATH_TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>
        <span className="flex w-full min-w-0 cursor-default select-none items-baseline">
          {showLeadingEllipsis ? <span className="shrink-0 text-text-weak">…</span> : null}
          <span
            ref={truncatorRef}
            dir="rtl"
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left"
          >
            <span dir="ltr" className="inline-block">
              <PermissionDockPathSegments display={display} />
            </span>
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 break-all font-mono text-xs">{props.path}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0"
            aria-label={language.t("chat.permissionDock.copyPath")}
            onClick={() => void onCopyPath()}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
