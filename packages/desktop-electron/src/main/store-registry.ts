import type { DesktopStoragePlan } from "./storage-paths"

/** Constructor options at the electron-store boundary. */
export type DesktopStoreOptions = {
  name: string
  fileExtension: ""
  cwd?: string
}

/** Cache named stores and apply an explicit distribution cwd to every constructor. */
export function createDesktopStoreRegistry<T>(input: {
  storagePlan: DesktopStoragePlan
  createStore: (options: DesktopStoreOptions) => T
}): (name: string) => T {
  const cache = new Map<string, T>()
  return (name) => {
    const cached = cache.get(name)
    if (cached !== undefined) return cached
    const options: DesktopStoreOptions = { name, fileExtension: "" }
    if (input.storagePlan.storeCwd) options.cwd = input.storagePlan.storeCwd
    const store = input.createStore(options)
    cache.set(name, store)
    return store
  }
}
