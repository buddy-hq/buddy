import type { UpdateRing } from "@buddy/update-contract"
import { normalizeUpdateRing, UPDATE_RING_PREVIEW } from "@buddy/update-contract"
import { UPDATE_DISTRIBUTION } from "./update-common"
import { store } from "./store"

const UPDATE_RING_STORE_KEY = "updateRing"

export function getUpdateRing(): UpdateRing {
  if (UPDATE_DISTRIBUTION.id === "beta") return UPDATE_RING_PREVIEW
  return normalizeUpdateRing(store.get(UPDATE_RING_STORE_KEY))
}

export function setUpdateRing(ring: UpdateRing): void {
  if (UPDATE_DISTRIBUTION.id === "beta") return
  store.set(UPDATE_RING_STORE_KEY, ring)
}
