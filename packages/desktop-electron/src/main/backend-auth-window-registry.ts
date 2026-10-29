type BackendAuthWindow = {
  once(event: "closed", listener: () => void): void
}

export function createBackendAuthWindowRegistry() {
  const windows = new WeakSet<BackendAuthWindow>()

  return {
    register(window: BackendAuthWindow) {
      windows.add(window)
      window.once("closed", () => windows.delete(window))
    },
    has(window: BackendAuthWindow | null): boolean {
      return window !== null && windows.has(window)
    },
  }
}
