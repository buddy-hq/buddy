import type { TeachingPromptContext, TeachingWorkspace, TeachingWorkspaceState } from "../state/teaching-mode"

type TeachingWorkspaceContextSource = TeachingWorkspace | TeachingWorkspaceState

export function buildTeachingPromptContext(
  workspace: TeachingWorkspaceContextSource | undefined,
): TeachingPromptContext | undefined {
  if (!workspace) {
    return undefined
  }

  const selection = "selection" in workspace ? workspace.selection : undefined

  return {
    active: true,
    sessionID: workspace.sessionID,
    lessonFilePath: workspace.lessonFilePath,
    checkpointFilePath: workspace.checkpointFilePath,
    language: workspace.language,
    revision: workspace.revision,
    ...(selection ?? {}),
  }
}

export async function resolveTeachingPromptContext(input: {
  workspace?: TeachingWorkspaceContextSource
  pendingWorkspace?: Promise<TeachingWorkspaceContextSource | undefined>
}): Promise<TeachingPromptContext | undefined> {
  if (input.workspace) {
    return buildTeachingPromptContext(input.workspace)
  }

  if (!input.pendingWorkspace) {
    return undefined
  }

  return buildTeachingPromptContext(await input.pendingWorkspace)
}
