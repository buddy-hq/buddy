const ONE_MINUTE_MS = 60_000
const ONE_HOUR_MS = 3_600_000
const ONE_DAY_MS = 86_400_000
const ONE_MONTH_MS = 2_592_000_000

export function formatThreadAge(timestamp: number) {
  const elapsed = Date.now() - timestamp

  if (elapsed < ONE_MINUTE_MS) return "now"
  if (elapsed < ONE_HOUR_MS) return `${Math.round(elapsed / ONE_MINUTE_MS)}m`
  if (elapsed < ONE_DAY_MS) return `${Math.round(elapsed / ONE_HOUR_MS)}h`
  if (elapsed < ONE_MONTH_MS) return `${Math.round(elapsed / ONE_DAY_MS)}d`
  return `${Math.round(elapsed / ONE_MONTH_MS)}mo`
}

export function sessionFamilyIDs(allSessions: { id: string; parentID?: string }[], rootID: string) {
  // Build a children-by-parentID map once to avoid O(n²) rescanning.
  const childrenByParent = new Map<string, string[]>()
  for (const session of allSessions) {
    if (!session.parentID) continue
    const existing = childrenByParent.get(session.parentID)
    if (existing) {
      existing.push(session.id)
    } else {
      childrenByParent.set(session.parentID, [session.id])
    }
  }

  const family = new Set<string>([rootID])
  const queue = [rootID]

  while (queue.length > 0) {
    const current = queue.pop()!
    const children = childrenByParent.get(current) ?? []
    for (const child of children) {
      if (!family.has(child)) {
        family.add(child)
        queue.push(child)
      }
    }
  }

  return Array.from(family)
}

export function findRootSessionID(
  allSessions: { id: string; parentID?: string }[],
  activeSessionID?: string,
) {
  if (!activeSessionID) return undefined

  const byID = new Map(allSessions.map((session) => [session.id, session]))
  let current = byID.get(activeSessionID)
  const visited = new Set<string>()

  while (current?.parentID) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    const parent = byID.get(current.parentID)
    if (!parent) break
    current = parent
  }

  return current?.id
}

export function threadStatusLabel(status: "busy" | "unread" | "idle") {
  switch (status) {
    case "busy":
      return "Live"
    case "unread":
      return "Unread"
    default:
      return "Up to date"
  }
}

export function ThreadStatusIndicator(props: { status: "busy" | "unread" | "idle" }) {
  if (props.status === "busy") {
    return (
      <span
        className="relative inline-flex size-2.5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full border border-[color:color-mix(in_oklab,var(--warning)_72%,transparent)]" />
        <span className="size-1 animate-pulse rounded-full bg-warning" />
      </span>
    )
  }

  if (props.status === "unread") {
    return (
      <span
        className="inline-block size-2 shrink-0 rotate-45 rounded-[1px] bg-info"
        aria-hidden="true"
      />
    )
  }

  return (
    <span className="inline-block size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
  )
}
