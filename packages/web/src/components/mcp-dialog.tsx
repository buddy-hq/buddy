import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@buddy/ui"
import { McpEditorDialog } from "./mcp-dialog/mcp-editor-dialog"
import { McpListPanel } from "./mcp-dialog/mcp-list-panel"
import { useMcpDirectoryData } from "./mcp-dialog/use-mcp-directory-data"
import { useMcpEditorState } from "./mcp-dialog/use-mcp-editor-state"

type McpDialogProps = {
  directory: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function McpDialog(props: McpDialogProps) {
  const directoryState = useMcpDirectoryData({
    directory: props.directory,
    open: props.open,
  })
  const editorState = useMcpEditorState({
    directory: props.directory,
    configByName: directoryState.configByName,
    setConfigByName: directoryState.setConfigByName,
    setError: directoryState.setError,
    enableMcp: directoryState.enableMcp,
  })

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>MCPs</DialogTitle>
            <DialogDescription>{`${directoryState.enabledCount} of ${directoryState.totalCount} enabled`}</DialogDescription>
          </DialogHeader>

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

          {directoryState.error ? (
            <p className="text-sm text-destructive">{directoryState.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              MCP definitions saved here override or extend this notebook's config.
            </p>
          )}
        </DialogContent>
      </Dialog>

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
