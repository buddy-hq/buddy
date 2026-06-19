import {
  loadNotebookAgentsMd,
  NotebookAgentsMdVersionConflictError,
  saveNotebookAgentsMd,
} from "@/state/agents-md-actions"

export const DEFAULT_NOTEBOOK_AGENTS_MD_CONTENT =
  "# AGENTS.md\n\nAdd notebook-specific instructions for Buddy here.\n"

export async function ensureNotebookAgentsMd(directory: string): Promise<void> {
  const current = await loadNotebookAgentsMd(directory)
  if (current.exists) return

  try {
    await saveNotebookAgentsMd({
      directory,
      content: DEFAULT_NOTEBOOK_AGENTS_MD_CONTENT,
      expectedVersion: null,
    })
  } catch (error) {
    if (!(error instanceof NotebookAgentsMdVersionConflictError)) throw error
    const winner = await loadNotebookAgentsMd(directory)
    if (!winner.exists) throw error
  }
}
