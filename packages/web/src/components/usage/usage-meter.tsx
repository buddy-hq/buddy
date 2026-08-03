import { cn } from "@buddy/ui"
import { language } from "@/context/language"

/**
 * The one meter for "how much of a budget is spent".
 *
 * Shared by the composer's plan-usage popover and the connected-account card
 * in settings so the same spend never reads two different ways: same fill
 * colours, same escalation thresholds, same `% used` phrasing. The card is the
 * wider surface and steps one notch up the type scale; nothing else differs.
 */

// The filled portion of a meter is a foreground *mark* carrying a status, so it
// draws from the icon (foreground) family — the surface family is reserved for
// backgrounds and the track groove. Base reads as the interactive accent and
// escalates to the system's real warning / critical colours across the same
// thresholds for every meter, so equal spend reads the same colour everywhere.
export type UsageMeterTone = "normal" | "warning" | "critical" | "empty"

/** `sm` is the 288px composer popover; `md` is the settings card. */
export type UsageMeterSize = "sm" | "md"

const WARNING_USED_PERCENT = 75
const CRITICAL_USED_PERCENT = 90

/** A percent or two of a wide rail is only a few pixels, and a fraction of a
 *  percent would round away to nothing — any spend at all is worth a tick. */
const MINIMUM_FILL_WIDTH = "3px"

const METER_FILL: Record<UsageMeterTone, string> = {
  normal: "bg-icon-interactive-base",
  warning: "bg-icon-warning-base",
  critical: "bg-icon-critical-base",
  empty: "bg-transparent",
}

export const USAGE_METER_RING_ARC: Record<UsageMeterTone, string> = {
  normal: "var(--icon-interactive-base)",
  warning: "var(--icon-warning-base)",
  critical: "var(--icon-critical-base)",
  empty: "var(--icon-weak-base)",
}

const ROW_TEXT: Record<UsageMeterSize, string> = {
  sm: "text-[11px]",
  md: "text-xs",
}

const CAPTION_TEXT: Record<UsageMeterSize, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
}

/**
 * The popover is 288px wide and stacked with three other blocks, so it is tight
 * by necessity. The card has five times the width and one block in it — at the
 * popover's spacing its three lines collapse into a stripe, so `md` opens the
 * gaps and thickens the rail to match the room it is given.
 */
const STACK_GAP: Record<UsageMeterSize, string> = {
  sm: "gap-1.5",
  md: "gap-2.5",
}

const BAR_HEIGHT: Record<UsageMeterSize, string> = {
  sm: "h-1.5",
  md: "h-2",
}

export function clampUsagePercent(value: number) {
  return Math.max(0, Math.min(value, 100))
}

/** Risk tone is always derived from budget *spent*, regardless of display. */
export function resolveUsageMeterTone(usedPercent: number): UsageMeterTone {
  if (usedPercent >= CRITICAL_USED_PERCENT) return "critical"
  if (usedPercent >= WARNING_USED_PERCENT) return "warning"
  return "normal"
}

export function UsageMeterBar(props: {
  usedPercent: number
  tone: UsageMeterTone
  size?: UsageMeterSize
}) {
  const used = clampUsagePercent(props.usedPercent)

  return (
    <div
      className={cn(
        "bg-surface-weak w-full overflow-hidden rounded-full",
        BAR_HEIGHT[props.size ?? "sm"],
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", METER_FILL[props.tone])}
        style={{
          width: `${used}%`,
          minWidth: used > 0 && props.tone !== "empty" ? MINIMUM_FILL_WIDTH : undefined,
        }}
      />
    </div>
  )
}

/**
 * Three lines, justified across whatever width it is given: what the budget is
 * ↔ where it stands, the rail, then the caption. The label is the only thing
 * set in medium — it is what you scan down when there are several — while the
 * number is a reading, so it stays weak and tabular.
 */
export function UsageMeter(props: {
  label: string
  /** `null` when the budget is known but its usage is not. */
  usedPercent: number | null
  caption?: string
  size?: UsageMeterSize
}) {
  const size = props.size ?? "sm"
  const usedPercent = props.usedPercent
  const used = usedPercent == null ? 0 : clampUsagePercent(usedPercent)
  const tone: UsageMeterTone = usedPercent == null ? "empty" : resolveUsageMeterTone(used)

  return (
    <div className={cn("flex flex-col", STACK_GAP[size])}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-text-base font-medium", ROW_TEXT[size])}>{props.label}</span>
        <span className={cn("text-text-weak tabular-nums", ROW_TEXT[size])}>
          {usedPercent == null
            ? "—"
            : language.t("usage.percentUsed", { percent: Math.round(used) })}
        </span>
      </div>
      <UsageMeterBar usedPercent={used} tone={tone} size={size} />
      {props.caption ? (
        <span className={cn("text-text-weaker leading-tight", CAPTION_TEXT[size])}>
          {props.caption}
        </span>
      ) : null}
    </div>
  )
}
