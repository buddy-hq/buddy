export const UPDATE_RING_STABLE = "stable"

export const UPDATE_RING_PREVIEW = "preview"

export const UPDATE_CHECK_MENU_COMMAND = "updates.check"

const UPDATE_RINGS = [UPDATE_RING_STABLE, UPDATE_RING_PREVIEW] as const

export type UpdateRing = (typeof UPDATE_RINGS)[number]

export type UpdateFailureStage = "check" | "download" | "install"

export type UpdateReleaseNote = {
  readonly version: string
  readonly url: string
  readonly items: readonly string[]
  readonly totalItems: number
}

export type UpdateDownloadProgress = {
  readonly percent?: number
  readonly transferredBytes?: number
  readonly totalBytes?: number
  readonly bytesPerSecond?: number
}

/**
 * Exactly one activity holds at a time, carrying only the fields meaningful
 * for that state.
 */
export type UpdateActivity =
  | { readonly status: "unsupported" }
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "up-to-date" }
  | { readonly status: "blocked" }
  | { readonly status: "available"; readonly version: string }
  | {
      readonly status: "downloading"
      readonly version: string
      readonly progress: UpdateDownloadProgress
    }
  | { readonly status: "downloaded"; readonly version: string }
  | { readonly status: "installing"; readonly version: string }

/** Kept separately so a failed check cannot hide an available or downloaded update. */
export type UpdateFailure = {
  readonly stage: UpdateFailureStage
}

export type UpdateState = {
  /** Lets readers reject stale snapshots, events, and command replies. */
  readonly revision: number
  readonly ring: UpdateRing
  readonly currentVersion: string
  readonly activity: UpdateActivity
  readonly failure?: UpdateFailure
  readonly checkedAt?: string
  readonly releaseNotes: readonly UpdateReleaseNote[]
}

export type UpdateAction = "check" | "download" | "install" | "none"

export function isUpdateRing<TValue>(value: TValue): value is TValue & UpdateRing {
  return value === UPDATE_RING_STABLE || value === UPDATE_RING_PREVIEW
}

export function normalizeUpdateRing<TValue>(value: TValue): UpdateRing {
  return isUpdateRing(value) ? value : UPDATE_RING_STABLE
}

export function createUpdateState(input: {
  readonly currentVersion: string
  readonly ring: UpdateRing
  readonly supported: boolean
}): UpdateState {
  return {
    revision: 0,
    ring: input.ring,
    currentVersion: input.currentVersion,
    activity: input.supported ? { status: "idle" } : { status: "unsupported" },
    releaseNotes: [],
  }
}

/**
 * Snapshots, pushed events, and command replies can arrive out of order, so only
 * a strictly newer revision may replace what a reader already has.
 */
export function supersedesUpdateState(
  candidate: UpdateState,
  current: UpdateState | undefined,
): boolean {
  return current === undefined || candidate.revision > current.revision
}

export function pendingUpdateVersion(state: UpdateState): string | undefined {
  const { activity } = state
  switch (activity.status) {
    case "available":
    case "downloading":
    case "downloaded":
    case "installing":
      return activity.version
    case "unsupported":
    case "idle":
    case "checking":
    case "up-to-date":
    case "blocked":
      return undefined
  }
}

export function isUpdateBusy(state: UpdateState): boolean {
  const { status } = state.activity
  return status === "checking" || status === "downloading" || status === "installing"
}

export function resolveUpdateAction(state: UpdateState): UpdateAction {
  const { activity } = state
  switch (activity.status) {
    case "downloaded":
      return "install"
    case "available":
      return "download"
    case "idle":
    case "up-to-date":
    case "blocked":
      return "check"
    case "unsupported":
    case "checking":
    case "downloading":
    case "installing":
      return "none"
  }
}

/**
 * An offered or downloaded build keeps its activity so its next action
 * survives the check and can still be restored if the check fails.
 */
export function beginCheck(state: UpdateState): UpdateState {
  if (state.activity.status === "unsupported") return state
  if (state.activity.status === "available" || state.activity.status === "downloaded") {
    return { ...state, failure: undefined }
  }
  return { ...state, activity: { status: "checking" }, failure: undefined }
}

export function completeCheckUpToDate(
  state: UpdateState,
  input: { readonly checkedAt: string },
): UpdateState {
  if (state.activity.status === "unsupported") return state
  return {
    ...state,
    activity: { status: "up-to-date" },
    checkedAt: input.checkedAt,
    failure: undefined,
    releaseNotes: [],
  }
}

export function completeCheckAvailable(
  state: UpdateState,
  input: {
    readonly version: string
    readonly checkedAt: string
    readonly releaseNotes?: readonly UpdateReleaseNote[]
  },
): UpdateState {
  if (state.activity.status === "unsupported") return state

  const releaseNotes = input.releaseNotes ?? state.releaseNotes
  if (state.activity.status === "downloaded" && state.activity.version === input.version) {
    return { ...state, checkedAt: input.checkedAt, failure: undefined, releaseNotes }
  }

  return {
    ...state,
    activity: { status: "available", version: input.version },
    checkedAt: input.checkedAt,
    failure: undefined,
    releaseNotes,
  }
}

export function completeCheckBlocked(
  state: UpdateState,
  input: { readonly checkedAt: string },
): UpdateState {
  if (state.activity.status === "unsupported") return state
  return {
    ...state,
    activity: { status: "blocked" },
    checkedAt: input.checkedAt,
    failure: undefined,
    releaseNotes: [],
  }
}

export function failCheck(state: UpdateState, input: { readonly checkedAt: string }): UpdateState {
  if (state.activity.status === "unsupported") return state
  const failure: UpdateFailure = { stage: "check" }
  if (state.activity.status === "available" || state.activity.status === "downloaded") {
    return { ...state, checkedAt: input.checkedAt, failure }
  }
  return { ...state, activity: { status: "idle" }, checkedAt: input.checkedAt, failure }
}

export function beginDownload(
  state: UpdateState,
  input: { readonly version: string },
): UpdateState {
  if (state.activity.status === "unsupported") return state
  return {
    ...state,
    activity: { status: "downloading", version: input.version, progress: {} },
    failure: undefined,
  }
}

export function reportDownloadProgress(
  state: UpdateState,
  progress: UpdateDownloadProgress,
): UpdateState {
  if (state.activity.status !== "downloading") return state
  return {
    ...state,
    activity: {
      status: "downloading",
      version: state.activity.version,
      progress: { ...progress, percent: clampPercent(progress.percent) },
    },
  }
}

export function completeDownload(
  state: UpdateState,
  input: { readonly version: string },
): UpdateState {
  if (state.activity.status === "unsupported") return state
  return {
    ...state,
    activity: { status: "downloaded", version: input.version },
    failure: undefined,
  }
}

export function failDownload(state: UpdateState): UpdateState {
  if (state.activity.status === "unsupported") return state
  const version = pendingUpdateVersion(state)
  return {
    ...state,
    activity: version === undefined ? { status: "idle" } : { status: "available", version },
    failure: { stage: "download" },
  }
}

export function beginInstall(state: UpdateState, input: { readonly version: string }): UpdateState {
  if (state.activity.status === "unsupported") return state
  return {
    ...state,
    activity: { status: "installing", version: input.version },
    failure: undefined,
  }
}

export function failInstall(state: UpdateState): UpdateState {
  if (state.activity.status === "unsupported") return state
  const version = pendingUpdateVersion(state)
  return {
    ...state,
    activity: version === undefined ? { status: "idle" } : { status: "downloaded", version },
    failure: { stage: "install" },
  }
}

/**
 * Anything learned about the previous ring no longer applies, so the state
 * returns to idle rather than offering a build from the ring the user left.
 */
export function selectRing(state: UpdateState, ring: UpdateRing): UpdateState {
  if (state.ring === ring) return state
  if (state.activity.status === "unsupported") return { ...state, ring }
  return {
    revision: state.revision,
    ring,
    currentVersion: state.currentVersion,
    activity: { status: "idle" },
    releaseNotes: [],
  }
}

function clampPercent(percent: number | undefined): number | undefined {
  if (percent === undefined || !Number.isFinite(percent)) return undefined
  return Math.min(100, Math.max(0, percent))
}
