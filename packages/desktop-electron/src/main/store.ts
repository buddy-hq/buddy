import Store from "electron-store"
import { app } from "electron"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveBuddyDistribution } from "@buddy/script/distribution"
import { CHANNEL, SETTINGS_STORE } from "./constants"
import { resolveDesktopStoragePlan } from "./storage-paths"
import { createDesktopStoreRegistry } from "./store-registry"

// Stores are imported before index.ts sets userData. Resolve Beta's cwd explicitly
// from its distribution identity instead of Electron's initial product-name path.
const storagePlan = resolveDesktopStoragePlan({
  channel: CHANNEL,
  isPackaged: app.isPackaged,
  home: homedir(),
  documentsPath: app.getPath("documents"),
  userDataPath: join(
    app.getPath("appData"),
    resolveBuddyDistribution(CHANNEL)?.appId ?? app.getName(),
  ),
})

const registry = createDesktopStoreRegistry({
  storagePlan,
  createStore: (options) => new Store(options),
})

/** Get a named desktop store in the current distribution. */
export function getStore(name = SETTINGS_STORE) {
  return registry(name)
}

export const store = getStore(SETTINGS_STORE)
