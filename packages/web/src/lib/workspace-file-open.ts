import { canOpenWorkspaceFileInPanel, isWorkspaceReaderPath } from "./workspace-file-media"
import { fileExtensionFromPath } from "./workspace-file-paths"

export const WORKSPACE_FILE_OPEN_TARGET_READING = "reading" as const
export const WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH = "markdown-bench" as const
export const WORKSPACE_FILE_OPEN_TARGET_PANEL = "workspace-panel" as const
export const WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP = "default-app" as const
export const WORKSPACE_FILE_OPEN_TARGET_REVEAL = "reveal" as const
export const WORKSPACE_FILE_OPEN_TARGET_COPY_PATH = "copy-path" as const

export type WorkspaceFileOpenTarget =
  | typeof WORKSPACE_FILE_OPEN_TARGET_READING
  | typeof WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH
  | typeof WORKSPACE_FILE_OPEN_TARGET_PANEL
  | typeof WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP
  | typeof WORKSPACE_FILE_OPEN_TARGET_REVEAL
  | typeof WORKSPACE_FILE_OPEN_TARGET_COPY_PATH

export type WorkspaceFileOpenInput = {
  path: string
  absolutePath?: string
  mimeType?: string
  sizeBytes?: number
  available: boolean
  canOpenInBuddy: boolean
  canOpenReading: boolean
  canOpenDefaultApp: boolean
  canReveal: boolean
}

export type WorkspaceFileOpenPlan = {
  primaryTarget: WorkspaceFileOpenTarget | undefined
  targets: WorkspaceFileOpenTarget[]
}

export function resolveWorkspaceFileOpenPlan(
  input: WorkspaceFileOpenInput,
): WorkspaceFileOpenPlan {
  if (!input.available) {
    return {
      primaryTarget: undefined,
      targets: [WORKSPACE_FILE_OPEN_TARGET_COPY_PATH],
    }
  }

  const targets: WorkspaceFileOpenTarget[] = []
  if (input.canOpenInBuddy && input.canOpenReading && isWorkspaceReaderPath(input.path)) {
    targets.push(WORKSPACE_FILE_OPEN_TARGET_READING)
  }
  if (input.canOpenInBuddy && fileExtensionFromPath(input.path) === "md") {
    targets.push(WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH)
  }
  if (
    input.canOpenInBuddy &&
    canOpenWorkspaceFileInPanel({
      path: input.path,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    })
  ) {
    targets.push(WORKSPACE_FILE_OPEN_TARGET_PANEL)
  }
  if (input.canOpenDefaultApp && input.absolutePath) {
    targets.push(WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP)
  }
  if (input.canReveal && input.absolutePath) {
    targets.push(WORKSPACE_FILE_OPEN_TARGET_REVEAL)
  }
  targets.push(WORKSPACE_FILE_OPEN_TARGET_COPY_PATH)

  return {
    primaryTarget:
      targets.find(
        (target) =>
          target === WORKSPACE_FILE_OPEN_TARGET_READING ||
          target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH ||
          target === WORKSPACE_FILE_OPEN_TARGET_PANEL ||
          target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
      ) ?? undefined,
    targets,
  }
}
