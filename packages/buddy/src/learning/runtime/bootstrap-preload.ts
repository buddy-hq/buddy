const BUDDY_BOOTSTRAP_PRELOAD_KEY = Symbol.for("buddy.bootstrapPreload")

type BuddyBootstrapGlobal = typeof globalThis & {
  [BUDDY_BOOTSTRAP_PRELOAD_KEY]?: Promise<void>
}

async function preloadBuddyBootstrapGraph(): Promise<void> {
  const globalObject = globalThis as BuddyBootstrapGlobal
  if (globalObject[BUDDY_BOOTSTRAP_PRELOAD_KEY]) {
    return globalObject[BUDDY_BOOTSTRAP_PRELOAD_KEY]
  }

  const task = (async () => {
    await import("../personas/registry")
    await import("./feature-registry")
    await import("./dynamic-tool-discovery")
    await import("../runtime-subagents")
    await import("../personas/wiring/create-buddy-persona-agent")
  })()

  globalObject[BUDDY_BOOTSTRAP_PRELOAD_KEY] = task
  return task
}

export { preloadBuddyBootstrapGraph }
