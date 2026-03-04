export const BUDDY_SURFACES = ["curriculum", "editor", "figure"] as const
export type BuddySurface = (typeof BUDDY_SURFACES)[number]

export const BUDDY_MODE_IDS = ["buddy", "code-buddy", "math-buddy"] as const
export type BuddyModeID = (typeof BUDDY_MODE_IDS)[number]

export type BuddyModeBehavior = {
  sessionProfile: "general" | "workspace" | "figure"
  attachCurriculum: boolean
  attachTeachingWorkspace: boolean
  attachTeachingPolicy: boolean
}

export type BuddyModeProfile = {
  id: BuddyModeID
  label: string
  description: string
  runtimeAgent: BuddyModeID
  surfaces: BuddySurface[]
  defaultSurface: BuddySurface
  hidden: boolean
  behavior: BuddyModeBehavior
}

export type BuddyModeOverride = {
  label?: string
  description?: string
  surfaces?: BuddySurface[]
  defaultSurface?: BuddySurface
  hidden?: boolean
}

export type BuddyModeCatalogEntry = Pick<
  BuddyModeProfile,
  "id" | "label" | "description" | "surfaces" | "defaultSurface" | "hidden"
>

export function isBuddyModeID(value: string): value is BuddyModeID {
  return BUDDY_MODE_IDS.includes(value as BuddyModeID)
}
