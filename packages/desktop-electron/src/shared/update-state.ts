export const UPDATE_RING_STABLE = "stable"
export const UPDATE_RING_PREVIEW = "preview"

export const UPDATE_RINGS = [UPDATE_RING_STABLE, UPDATE_RING_PREVIEW] as const

export type UpdateRing = (typeof UPDATE_RINGS)[number]

export type UpdateProgressStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing"
  | "error"

export type UpdateProgressErrorStage = "check" | "download" | "install"

export type UpdateProgressSnapshot = {
  bytesPerSecond?: number
  errorStage?: UpdateProgressErrorStage
  message?: string
  percent?: number
  ring: UpdateRing
  status: UpdateProgressStatus
  totalBytes?: number
  transferredBytes?: number
  version?: string
}

export function isUpdateRing<TValue>(value: TValue): value is TValue & UpdateRing {
  return value === UPDATE_RING_STABLE || value === UPDATE_RING_PREVIEW
}

export function normalizeUpdateRing<TValue>(value: TValue): UpdateRing {
  return isUpdateRing(value) ? value : UPDATE_RING_STABLE
}

export function createIdleUpdateProgress(ring: UpdateRing): UpdateProgressSnapshot {
  return {
    ring,
    status: "idle",
  }
}
