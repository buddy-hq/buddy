import { LoaderCircleIcon } from "lucide-react"
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

export function threadStatusLabel(status: "busy" | "unread" | "idle") {
  switch (status) {
    case "busy":
      return language.t("sidebar.statusLive")
    case "unread":
      return language.t("sidebar.statusUnread")
    default:
      return language.t("sidebar.statusUpToDate")
  }
}

export function ThreadStatusIndicator(props: { status: "busy" | "unread" | "idle" }) {
  if (props.status === "busy") {
    return (
      <LoaderCircleIcon
        className="size-3 shrink-0 animate-spin text-text-weaker group-hover/thread:text-text-base transition-colors"
        aria-hidden="true"
      />
    )
  }

  if (props.status === "unread") {
    return (
      <span
        className="inline-block size-1.5 shrink-0 rounded-full bg-surface-success-base"
        aria-hidden="true"
      />
    )
  }

  return null
}
