import { useCallback, useSyncExternalStore } from "react"
import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import {
  UPDATE_RING_STABLE,
  createUpdateState,
  supersedesUpdateState,
} from "@buddy/update-contract"
import { usePlatform, type Platform } from "@/context/platform"

type UpdatePlatform = Pick<
  Platform,
  | "version"
  | "getUpdateState"
  | "onUpdateState"
  | "checkUpdate"
  | "downloadUpdate"
  | "installUpdate"
  | "setUpdateRing"
>

type UpdateStateStore = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => UpdateState
  readonly apply: (state: UpdateState) => UpdateState
}

const stores = new WeakMap<UpdatePlatform, UpdateStateStore>()

function unsupportedState(platform: UpdatePlatform): UpdateState {
  return createUpdateState({
    currentVersion: platform.version ?? "",
    ring: UPDATE_RING_STABLE,
    supported: false,
  })
}

function createUpdateStateStore(platform: UpdatePlatform): UpdateStateStore {
  const listeners = new Set<() => void>()
  const fallback = unsupportedState(platform)
  let snapshot: UpdateState | undefined
  let unsubscribeFromPlatform: (() => void) | undefined

  const apply = (state: UpdateState): UpdateState => {
    if (!supersedesUpdateState(state, snapshot)) return snapshot ?? fallback
    snapshot = state
    for (const listener of listeners) listener()
    return snapshot
  }

  return {
    apply,
    getSnapshot: () => snapshot ?? fallback,
    subscribe: (listener) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        unsubscribeFromPlatform = platform.onUpdateState?.(apply)
        void platform.getUpdateState?.().then(apply)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        unsubscribeFromPlatform?.()
        unsubscribeFromPlatform = undefined
      }
    },
  }
}

function storeFor(platform: UpdatePlatform): UpdateStateStore {
  const existing = stores.get(platform)
  if (existing) return existing

  const created = createUpdateStateStore(platform)
  stores.set(platform, created)
  return created
}

/**
 * Every caller shares one subscription to the shell, so the state cannot drift
 * between the sidebar control and the settings panel.
 */
export function useUpdateState(): UpdateState {
  const platform = usePlatform()
  const store = storeFor(platform)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useUpdateCommands() {
  const platform = usePlatform()
  const store = storeFor(platform)

  const run = useCallback(
    async (command: () => Promise<UpdateState> | undefined) => {
      const result = command()
      if (!result) return undefined
      const state = await result
      return store.apply(state)
    },
    [store],
  )

  return {
    check: useCallback(() => run(() => platform.checkUpdate?.()), [platform, run]),
    download: useCallback(() => run(() => platform.downloadUpdate?.()), [platform, run]),
    install: useCallback(() => run(() => platform.installUpdate?.()), [platform, run]),
    setRing: useCallback(
      (ring: UpdateRing) => run(() => platform.setUpdateRing?.(ring)),
      [platform, run],
    ),
  }
}
