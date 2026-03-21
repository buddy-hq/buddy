import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@buddy/ui"
import {
  getFieldErrorId,
  type McpEditorMode,
  type McpFieldErrors,
  type McpFieldName,
  type McpFormDraft,
} from "./mcp-config-schema"
import { McpLocalFields } from "./mcp-local-fields"
import { McpRemoteFields } from "./mcp-remote-fields"

type McpEditorDialogProps = {
  open: boolean
  onOpenChange: (nextOpen: boolean) => void
  mode: McpEditorMode
  draft: McpFormDraft
  setDraft: (next: McpFormDraft | ((current: McpFormDraft) => McpFormDraft)) => void
  showOAuthClientFields: boolean
  setShowOAuthClientFields: (next: boolean | ((current: boolean) => boolean)) => void
  fieldErrors: McpFieldErrors
  editorError?: string
  editorSaving: boolean
  clearFieldError: (field: McpFieldName) => void
  getFieldProps: (
    field: McpFieldName,
    describedBy?: string,
  ) => {
    "aria-describedby": string | undefined
    "aria-errormessage": string | undefined
    "aria-invalid": true | undefined
  }
  onSave: () => Promise<void>
}

export function McpEditorDialog(props: McpEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "create" ? "Add MCP" : `Edit ${props.draft.name}`}
          </DialogTitle>
          <DialogDescription>
            Save a notebook-level MCP definition in this repository's config.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="mcp-name">
              Name
            </label>
            <Input
              id="mcp-name"
              value={props.draft.name}
              disabled={props.mode === "edit"}
              onChange={(event) => {
                const value = event.target.value
                props.setDraft((current) => ({
                  ...current,
                  name: value,
                }))
                props.clearFieldError("name")
              }}
              placeholder="docs"
              {...props.getFieldProps("name")}
            />
            {props.fieldErrors.name ? (
              <p id={getFieldErrorId("name")} className="text-xs text-destructive">
                {props.fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="mcp-type">
              Type
            </label>
            <Select
              value={props.draft.type}
              onValueChange={(value) => {
                if (value !== "local" && value !== "remote") return
                props.setDraft((current) => ({
                  ...current,
                  type: value,
                }))
              }}
              disabled={props.mode === "edit"}
            >
              <SelectTrigger id="mcp-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled by default</p>
              <p className="text-xs text-muted-foreground">
                Saved as the MCP's initial enabled state.
              </p>
            </div>
            <Switch
              checked={props.draft.enabled}
              onCheckedChange={(checked) => {
                props.setDraft((current) => ({
                  ...current,
                  enabled: checked,
                }))
              }}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="mcp-timeout">
              Timeout (seconds)
            </label>
            <Input
              id="mcp-timeout"
              value={props.draft.timeout}
              onChange={(event) => {
                const value = event.target.value
                props.setDraft((current) => ({
                  ...current,
                  timeout: value,
                }))
                props.clearFieldError("timeout")
              }}
              placeholder="30"
              inputMode="numeric"
              {...props.getFieldProps("timeout")}
            />
            {props.fieldErrors.timeout ? (
              <p id={getFieldErrorId("timeout")} className="text-xs text-destructive">
                {props.fieldErrors.timeout}
              </p>
            ) : null}
          </div>

          {props.draft.type === "remote" ? (
            <McpRemoteFields
              draft={props.draft}
              fieldErrors={{
                url: props.fieldErrors.url,
                headers: props.fieldErrors.headers,
              }}
              showOAuthClientFields={props.showOAuthClientFields}
              setShowOAuthClientFields={props.setShowOAuthClientFields}
              setDraft={props.setDraft}
              clearFieldError={(field) => props.clearFieldError(field)}
              getFieldProps={(field) => props.getFieldProps(field)}
            />
          ) : (
            <McpLocalFields
              draft={props.draft}
              fieldErrors={{
                command: props.fieldErrors.command,
                environment: props.fieldErrors.environment,
              }}
              setDraft={props.setDraft}
              clearFieldError={(field) => props.clearFieldError(field)}
              getFieldProps={(field, describedBy) => props.getFieldProps(field, describedBy)}
            />
          )}
        </div>

        {props.editorError ? <p className="text-sm text-destructive">{props.editorError}</p> : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.editorSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void props.onSave()
            }}
            disabled={props.editorSaving}
          >
            {props.editorSaving
              ? "Saving..."
              : props.mode === "create"
                ? "Add MCP"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
