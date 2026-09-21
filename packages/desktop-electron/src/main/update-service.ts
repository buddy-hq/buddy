import type {
  UpdateDownloadProgress,
  UpdateFailureStage,
  UpdateReleaseNote,
  UpdateRing,
  UpdateState,
} from "@buddy/update-contract"
import {
  beginCheck,
  beginDownload,
  beginInstall,
  completeCheckAvailable,
  completeCheckBlocked,
  completeCheckUpToDate,
  completeDownload,
  createUpdateState,
  failCheck,
  failDownload,
  failInstall,
  isUpdateBusy,
  reportDownloadProgress,
  selectRing,
} from "@buddy/update-contract"

const UPDATE_STARTUP_CHECK_DELAY_MS = 20_000
const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000

export type UpdateCheckOutcome =
  | { readonly kind: "up-to-date" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "blocked" }
  | { readonly kind: "failed" }

export type UpdateDownloadOutcome =
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "failed" }

export type UpdateInstallOutcome =
  | { readonly kind: "started" }
  | { readonly kind: "failed" }

/**
 * Platform-specific update operations. Calls already hold the update lock, and
 * implementations report expected failures as outcomes rather than rejections.
 */
export type UpdateMechanics = {
  readonly checkLatest: (input: { readonly ring: UpdateRing }) => Promise<UpdateCheckOutcome>
  readonly download: (input: {
    readonly ring: UpdateRing
    readonly version: string
    readonly onProgress: (progress: UpdateDownloadProgress) => void
  }) => Promise<UpdateDownloadOutcome>
  readonly install: (input: {
    readonly ring: UpdateRing
    readonly version: string
  }) => Promise<UpdateInstallOutcome>
}

export type UpdateServiceDependencies = {
  readonly runExclusive: <TValue>(run: () => Promise<TValue>) => Promise<TValue>
  readonly readReleaseNotes: (input: {
    readonly currentVersion: string
    readonly targetVersion: string
    readonly ring: UpdateRing
  }) => Promise<readonly UpdateReleaseNote[]>
  readonly persistRing: (ring: UpdateRing) => void
  readonly discardReadyUpdate: () => void
  readonly now: () => Date
  readonly reportUnexpectedError: (input: {
    readonly operation: UpdateFailureStage
    readonly cause: unknown
  }) => void
  readonly scheduleOnce: (run: () => Promise<void>, delayMs: number) => () => void
  readonly scheduleRecurring: (run: () => Promise<void>, intervalMs: number) => () => void
}

export type UpdateService = {
  readonly getState: () => UpdateState
  readonly subscribe: (listener: (state: UpdateState) => void) => () => void
  readonly check: () => Promise<UpdateState>
  readonly download: () => Promise<UpdateState>
  readonly install: () => Promise<UpdateState>
  readonly setRing: (ring: UpdateRing) => Promise<UpdateState>
  readonly startPolling: () => () => void
}

/**
 * Own update state and serialize commands so work cannot overlap or switch to
 * a different ring/version after the user acts.
 */
export function createUpdateService(input: {
  readonly currentVersion: string
  readonly ring: UpdateRing
  readonly supported: boolean
  readonly mechanics: UpdateMechanics
  readonly dependencies: UpdateServiceDependencies
}): UpdateService {
  const { mechanics, dependencies } = input
  const listeners = new Set<(state: UpdateState) => void>()

  let state = createUpdateState({
    currentVersion: input.currentVersion,
    ring: input.ring,
    supported: input.supported,
  })
  let activeCheck: Promise<UpdateState> | undefined

  const commit = (next: UpdateState): UpdateState => {
    if (next === state) return state
    state = { ...next, revision: state.revision + 1 }
    for (const listener of listeners) listener(state)
    return state
  }

  const runCheck = async (): Promise<UpdateState> => {
    if (state.activity.status === "unsupported") return state

    commit(beginCheck(state))
    try {
      const outcome = await mechanics.checkLatest({ ring: state.ring })
      const checkedAt = dependencies.now().toISOString()

      switch (outcome.kind) {
        case "up-to-date":
          return commit(completeCheckUpToDate(state, { checkedAt }))
        case "blocked":
          return commit(completeCheckBlocked(state, { checkedAt }))
        case "failed":
          return commit(failCheck(state, { checkedAt }))
        case "available": {
          const releaseNotes = await dependencies.readReleaseNotes({
            currentVersion: state.currentVersion,
            targetVersion: outcome.version,
            ring: state.ring,
          })
          return commit(
            completeCheckAvailable(state, { version: outcome.version, checkedAt, releaseNotes }),
          )
        }
      }
    } catch (cause) {
      dependencies.reportUnexpectedError({ operation: "check", cause })
      return commit(failCheck(state, { checkedAt: dependencies.now().toISOString() }))
    }
  }

  const runDownload = async (target: {
    readonly ring: UpdateRing
    readonly version: string
  }): Promise<UpdateState> => {
    if (
      state.activity.status !== "available" ||
      state.ring !== target.ring ||
      state.activity.version !== target.version
    ) {
      return state
    }

    const { version, ring } = target
    commit(beginDownload(state, { version }))

    try {
      const outcome = await mechanics.download({
        ring,
        version,
        onProgress: (progress) => {
          commit(reportDownloadProgress(state, progress))
        },
      })

      if (outcome.kind === "failed" || outcome.version !== version) {
        return commit(failDownload(state))
      }
      return commit(completeDownload(state, { version }))
    } catch (cause) {
      dependencies.reportUnexpectedError({ operation: "download", cause })
      return commit(failDownload(state))
    }
  }

  const runInstall = async (target: {
    readonly ring: UpdateRing
    readonly version: string
  }): Promise<UpdateState> => {
    if (
      state.activity.status !== "downloaded" ||
      state.ring !== target.ring ||
      state.activity.version !== target.version
    ) {
      return state
    }

    const { version, ring } = target
    commit(beginInstall(state, { version }))

    try {
      const outcome = await mechanics.install({ ring, version })
      if (outcome.kind === "failed") return commit(failInstall(state))
      return state
    } catch (cause) {
      dependencies.reportUnexpectedError({ operation: "install", cause })
      return commit(failInstall(state))
    }
  }

  const runSetRing = async (ring: UpdateRing): Promise<UpdateState> => {
    if (state.ring === ring) return state

    dependencies.persistRing(ring)
    dependencies.discardReadyUpdate()
    commit(selectRing(state, ring))
    return await runCheck()
  }

  const check = (): Promise<UpdateState> => {
    if (activeCheck) return activeCheck

    const task = dependencies.runExclusive(runCheck)
    const tracked: Promise<UpdateState> = task.finally(() => {
      if (activeCheck === tracked) activeCheck = undefined
    })
    activeCheck = tracked
    return tracked
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    check,
    download: () => {
      if (state.activity.status !== "available") return Promise.resolve(state)
      const target = { ring: state.ring, version: state.activity.version }
      return dependencies.runExclusive(() => runDownload(target))
    },
    install: () => {
      if (state.activity.status !== "downloaded") return Promise.resolve(state)
      const target = { ring: state.ring, version: state.activity.version }
      return dependencies.runExclusive(() => runInstall(target))
    },
    setRing: (ring) => dependencies.runExclusive(() => runSetRing(ring)),
    startPolling: () => {
      if (state.activity.status === "unsupported") return () => undefined

      const checkInBackground = async (): Promise<void> => {
        if (isUpdateBusy(state)) return
        await check().catch((cause) => {
          dependencies.reportUnexpectedError({ operation: "check", cause })
        })
      }

      const stopStartupCheck = dependencies.scheduleOnce(
        checkInBackground,
        UPDATE_STARTUP_CHECK_DELAY_MS,
      )
      const stopRecurringChecks = dependencies.scheduleRecurring(
        checkInBackground,
        UPDATE_POLL_INTERVAL_MS,
      )

      return () => {
        stopStartupCheck()
        stopRecurringChecks()
      }
    },
  }
}
