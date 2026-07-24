import type { editor as MonacoEditor } from "monaco-editor"

/**
 * Monaco view state, kept by editor path across unmounts.
 *
 * `@monaco-editor/react` disposes the text model when the editor unmounts, so an evicted editor
 * otherwise returns with its cursor at the top, no selection, no scroll position, and no folding.
 * This cache is bounded and holds only plain view-state objects — never editor or model instances.
 *
 * Keys include the notebook: editor paths are notebook-relative, so two notebooks each holding a
 * `README.md` would otherwise share one entry and restore each other's cursor and scroll.
 */

const MONACO_VIEW_STATE_LIMIT = 24

const viewStateByPath = new Map<string, MonacoEditor.ICodeEditorViewState>()

export function monacoViewStateKey(input: { directory: string; path: string }): string {
  return `${input.directory}\u0000${input.path}`
}

export function saveMonacoViewState(input: {
  editor: MonacoEditor.IStandaloneCodeEditor
  directory: string
  path: string
}): void {
  if (!input.path) return
  const viewState = input.editor.saveViewState()
  if (!viewState) return
  const key = monacoViewStateKey(input)
  viewStateByPath.delete(key)
  viewStateByPath.set(key, viewState)
  while (viewStateByPath.size > MONACO_VIEW_STATE_LIMIT) {
    const oldest = viewStateByPath.keys().next()
    if (oldest.done) break
    viewStateByPath.delete(oldest.value)
  }
}

export function restoreMonacoViewState(input: {
  editor: MonacoEditor.IStandaloneCodeEditor
  directory: string
  path: string
}): void {
  const viewState = viewStateByPath.get(monacoViewStateKey(input))
  if (!viewState) return
  input.editor.restoreViewState(viewState)
}

export function clearMonacoViewStateForTests(): void {
  viewStateByPath.clear()
}
