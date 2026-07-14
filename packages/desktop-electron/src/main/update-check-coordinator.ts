import type { UpdateRing } from "../shared/update-state"

type RunUpdateCheck<Result> = (ring: UpdateRing) => Promise<Result>

export type ReadyUpdate = {
  ring: UpdateRing
  version: string
}

export type ReadyUpdateStore = {
  clear: () => ReadyUpdate | undefined
  get: () => ReadyUpdate | undefined
  set: (update: ReadyUpdate) => void
  take: (ring: UpdateRing) => ReadyUpdate | undefined
}

export function isReadyUpdateCurrent(
  readyUpdate: ReadyUpdate | undefined,
  ring: UpdateRing,
  manifestVersion: string,
): boolean {
  return readyUpdate?.ring === ring && readyUpdate.version === manifestVersion
}

export function createReadyUpdateStore(): ReadyUpdateStore {
  let readyUpdate: ReadyUpdate | undefined

  const clear = (): ReadyUpdate | undefined => {
    const previous = readyUpdate
    readyUpdate = undefined
    return previous
  }

  return {
    clear,
    get: () => readyUpdate,
    set: (update) => {
      readyUpdate = update
    },
    take: (ring) => {
      if (readyUpdate?.ring !== ring) return undefined
      return clear()
    },
  }
}

export function createUpdateCheckCoordinator<Result>(runUpdateCheck: RunUpdateCheck<Result>) {
  const tasks = new Map<UpdateRing, Promise<Result>>()
  let queue: Promise<void> = Promise.resolve()

  const runExclusive = <Value>(run: () => Promise<Value>): Promise<Value> => {
    const task = queue.then(run, run)
    queue = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }

  const check = async (ring: UpdateRing): Promise<Result> => {
    const existingTask = tasks.get(ring)
    if (existingTask) return await existingTask

    const task = runExclusive(() => runUpdateCheck(ring)).finally(() => {
      tasks.delete(ring)
    })
    tasks.set(ring, task)
    return await task
  }

  return { check, runExclusive }
}
