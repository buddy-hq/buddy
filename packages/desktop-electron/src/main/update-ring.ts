import type { UpdateRing } from "@buddy/update-contract"
import { normalizeUpdateRing } from "@buddy/update-contract"
import { store } from "./store"

const UPDATE_RING_STORE_KEY = "updateRing"

export function getUpdateRing(): UpdateRing {
  return normalizeUpdateRing(store.get(UPDATE_RING_STORE_KEY))
}

export function setUpdateRing(ring: UpdateRing): void {
  store.set(UPDATE_RING_STORE_KEY, ring)
}
