let buddyBootstrapPreload: Promise<void> | undefined

async function preloadBuddyBootstrapGraph(): Promise<void> {
  if (buddyBootstrapPreload) {
    return buddyBootstrapPreload
  }

  const task = (async () => {
    await import("../personas/registry")
    await import("./feature-registry")
    await import("./dynamic-tool-discovery")
    await import("../runtime-subagents")
    await import("../personas/wiring/create-buddy-persona-agent")
  })()

  buddyBootstrapPreload = task
  return task
}

export { preloadBuddyBootstrapGraph }
