const suppressedWhiteboardAutoOpenKeyByDirectory = new Map<string, string>()

function suppressWhiteboardAutoOpen(directory: string, toolKey: string | undefined) {
  if (!directory || !toolKey) return
  suppressedWhiteboardAutoOpenKeyByDirectory.set(directory, toolKey)
}

function readSuppressedWhiteboardAutoOpenKey(directory: string) {
  return suppressedWhiteboardAutoOpenKeyByDirectory.get(directory)
}

function clearSuppressedWhiteboardAutoOpen(directory: string) {
  if (!directory) return
  suppressedWhiteboardAutoOpenKeyByDirectory.delete(directory)
}

export {
  clearSuppressedWhiteboardAutoOpen,
  readSuppressedWhiteboardAutoOpenKey,
  suppressWhiteboardAutoOpen,
}
