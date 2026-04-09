type CollectionShim = {
  get(key: unknown): unknown
  has(key: unknown): boolean
  set(key: unknown, value: unknown): unknown
}

type CollectionConstructor = MapConstructor | WeakMapConstructor

function ensureGetOrInsertComputed(ctor: CollectionConstructor) {
  const { prototype } = ctor
  if ("getOrInsertComputed" in prototype) return

  Object.defineProperty(prototype, "getOrInsertComputed", {
    value(this: CollectionShim, key: unknown, factory: (key: unknown) => unknown) {
      if (this.has(key)) return this.get(key)
      const value = factory(key)
      this.set(key, value)
      return value
    },
    configurable: true,
    writable: true,
  })
}

let foliateRuntimeCompatReady = false

export function ensureFoliateRuntimeCompat() {
  if (foliateRuntimeCompatReady) return
  ensureGetOrInsertComputed(Map)
  ensureGetOrInsertComputed(WeakMap)
  foliateRuntimeCompatReady = true
}
