export type SettingsWorkbench = {
  selectedDirectory: string
  openDirectories: string[]
  selectedNotebookName: string
  hasSelectedNotebook: boolean
}

function notebookDisplayName(directory: string): string {
  const parts = directory.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? directory
}

export function createSettingsWorkbench(input: {
  selectedDirectory: string
  openDirectories: string[]
}): SettingsWorkbench {
  return {
    selectedDirectory: input.selectedDirectory,
    openDirectories: input.openDirectories,
    selectedNotebookName: input.selectedDirectory
      ? notebookDisplayName(input.selectedDirectory)
      : "No notebook selected",
    hasSelectedNotebook: input.selectedDirectory.length > 0,
  }
}
