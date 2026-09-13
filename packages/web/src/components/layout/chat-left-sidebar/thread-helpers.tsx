import { language } from "@/context/language"
import { LoaderCircleIcon, RotateCwIcon } from "@/icons/app-icons"
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
 * Every status renders inside the same fixed leading slot, so a thread moving
 * through these states never shifts anything around it. Shape carries the state
 * (dot, spinner, retry arrow), so it still reads without colour or motion.
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

// Glyphs stay within the 14px leading slot (see row-geometry.ts).
function ThreadStatusGlyph(props: { status: Exclude<ThreadStatus, "idle"> }) {
  if (props.status === "working") {
    return (
      <LoaderCircleIcon
        aria-hidden="true"
        className="size-3 text-icon-interactive-base motion-safe:animate-[spin_2s_linear_infinite]"
      />
    )
  }
  if (props.status === "retrying") {
    return <RotateCwIcon aria-hidden="true" className="size-3 text-icon-warning-base" />
  }
  return <span className="block size-1.5 rounded-full bg-surface-interactive-base" />
}

export function ThreadStatusIndicator(props: { status: ThreadStatus }) {
  if (props.status === "idle") return null

  const label = threadStatusLabel(props.status)

  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <ThreadStatusGlyph status={props.status} />
    </span>
  )
}
