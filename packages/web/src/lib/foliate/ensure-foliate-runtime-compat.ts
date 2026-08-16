type TKeyedCollection<TKey, TValue> = {
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  set(key: TKey, value: TValue): TKeyedCollection<TKey, TValue>
}

type TCollectionConstructor = MapConstructor | WeakMapConstructor

function ensureGetOrInsertComputed(ctor: TCollectionConstructor) {
  const { prototype } = ctor
  if ("getOrInsertComputed" in prototype) return

  Object.defineProperty(prototype, "getOrInsertComputed", {
    value<TKey, TValue>(
      this: TKeyedCollection<TKey, TValue>,
      key: TKey,
      factory: (key: TKey) => TValue,
    ) {
      if (this.has(key)) {
        const existing = this.get(key)
        if (existing !== undefined) return existing
      }
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
