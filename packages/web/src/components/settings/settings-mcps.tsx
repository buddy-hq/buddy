import { McpEditorDialog } from "@/components/mcp-dialog/mcp-editor-dialog"
import { McpListPanel } from "@/components/mcp-dialog/mcp-list-panel"
import { useMcpDirectoryData } from "@/components/mcp-dialog/use-mcp-directory-data"
import { useMcpEditorState } from "@/components/mcp-dialog/use-mcp-editor-state"
import { SettingsContent } from "./settings-primitives"
import type { SettingsWorkbench } from "./settings-workbench"

export function McpsSettings({ workbench }: { workbench: SettingsWorkbench }) {
  const directory = workbench.selectedDirectory
  const directoryState = useMcpDirectoryData({
    directory,
    open: true,
  })
  const editorState = useMcpEditorState({
    directory,
    configByName: directoryState.configByName,
    setConfigByName: directoryState.setConfigByName,
    setError: directoryState.setError,
    enableMcp: directoryState.enableMcp,
  })

  return (
    <>
      <SettingsContent>
        <div data-component="settings-mcp-panel" className="contents">
          <McpListPanel
            allNames={directoryState.allNames}
            entries={directoryState.entries}
            showSearch={directoryState.showSearch}
            loading={directoryState.loading}
            query={directoryState.query}
            setQuery={directoryState.setQuery}
            pendingName={directoryState.pendingName}
            statusByName={directoryState.statusByName}
            configByName={directoryState.configByName}
            onAddMcp={editorState.openCreateEditor}
            onEditMcp={editorState.openEditEditor}
            onToggleMcp={directoryState.toggleMcp}
            onConnectMcp={directoryState.connectMcp}
          />
        </div>
        {directoryState.error ? (
          <p className="text-sm text-icon-critical-base">{directoryState.error}</p>
        ) : null}
      </SettingsContent>
      <McpEditorDialog
        open={editorState.editorOpen}
        onOpenChange={editorState.onEditorOpenChange}
        mode={editorState.editorMode}
        draft={editorState.draft}
        setDraft={editorState.setDraft}
        showOAuthClientFields={editorState.showOAuthClientFields}
        setShowOAuthClientFields={editorState.setShowOAuthClientFields}
        fieldErrors={editorState.fieldErrors}
        editorError={editorState.editorError}
        editorSaving={editorState.editorSaving}
        clearFieldError={editorState.clearFieldError}
        getFieldProps={editorState.getFieldProps}
        onSave={editorState.saveConfig}
      />
    </>
  )
}
