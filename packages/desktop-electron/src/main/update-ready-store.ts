import type { UpdateRing } from "@buddy/update-contract"

type ReadyUpdate = {
  readonly ring: UpdateRing
  readonly version: string
}

export function isReadyUpdateCurrent(
  readyUpdate: ReadyUpdate | undefined,
  ring: UpdateRing,
  manifestVersion: string,
): boolean {
  return readyUpdate?.ring === ring && readyUpdate.version === manifestVersion
}

export function createReadyUpdateStore() {
  let readyUpdate: ReadyUpdate | undefined

  const clear = (): ReadyUpdate | undefined => {
    const previous = readyUpdate
    readyUpdate = undefined
    return previous
  }

  return {
    clear,
    get: () => readyUpdate,
    set: (update: ReadyUpdate) => {
      readyUpdate = update
    },
    take: (ring: UpdateRing) => {
      if (readyUpdate?.ring !== ring) return undefined
      return clear()
    },
  }
}
