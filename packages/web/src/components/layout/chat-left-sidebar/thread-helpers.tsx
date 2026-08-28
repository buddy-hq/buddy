import { cn } from "@buddy/ui"
import { language } from "@/context/language"
export {
  buildSessionChildrenByParent,
  findRootSessionID,
  parseSubagentSession,
  sessionFamilyIDs,
} from "@/lib/session-family"

const ONE_MINUTE_MS = 60_000
const ONE_HOUR_MS = 3_600_000
const ONE_DAY_MS = 86_400_000
const ONE_MONTH_MS = 2_592_000_000

export function formatThreadAge(timestamp: number) {
  const elapsed = Date.now() - timestamp

  if (elapsed < ONE_MINUTE_MS) return language.t("sidebar.timeNow")
  if (elapsed < ONE_HOUR_MS) return `${Math.round(elapsed / ONE_MINUTE_MS)}m`
  if (elapsed < ONE_DAY_MS) return `${Math.round(elapsed / ONE_HOUR_MS)}h`
  if (elapsed < ONE_MONTH_MS) return `${Math.round(elapsed / ONE_DAY_MS)}d`
  return `${Math.round(elapsed / ONE_MONTH_MS)}mo`
}

/**
 * One dot, one slot, one size. Position never changes across states — only fill
 * colour and whether it pulses, so a thread moving through these states never
 * shifts anything around it.
 */
export type ThreadStatus = "idle" | "unread" | "working" | "retrying"

export function threadStatusLabel(status: ThreadStatus) {
  switch (status) {
    case "working":
      return language.t("sidebar.statusLive")
    case "retrying":
      return language.t("sidebar.statusRetrying")
    case "unread":
      return language.t("sidebar.statusUnread")
    default:
      return language.t("sidebar.statusUpToDate")
  }
}

// Pulsing is the only channel separating `working` from `unread` — both are solid
// interactive dots. When motion is suppressed the pulse can't carry that, so the
// active states fall back to a static ring.
const THREAD_STATUS_DOT_CLASSES = {
  unread: { fill: "bg-surface-interactive-base" },
  working: {
    fill: "bg-surface-interactive-base",
    motion:
      "motion-safe:animate-pulse motion-reduce:ring-2 motion-reduce:ring-surface-interactive-base/40",
  },
  retrying: {
    fill: "bg-surface-warning-base",
    motion:
      "motion-safe:animate-pulse motion-reduce:ring-2 motion-reduce:ring-surface-warning-base/40",
  },
} satisfies Record<Exclude<ThreadStatus, "idle">, { fill: string; motion?: string }>

export function ThreadStatusIndicator(props: { status: ThreadStatus }) {
  if (props.status === "idle") return null

  const label = threadStatusLabel(props.status)
  const dot = THREAD_STATUS_DOT_CLASSES[props.status]
  const motion = "motion" in dot ? dot.motion : undefined

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", dot.fill, motion)}
    />
  )
}
