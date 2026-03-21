import { Textarea } from "@buddy/ui"
import { getFieldErrorId, type McpFormDraft } from "./mcp-config-schema"

type McpLocalFieldsProps = {
  draft: McpFormDraft
  fieldErrors: Partial<Record<"command" | "environment", string>>
  setDraft: (next: McpFormDraft | ((current: McpFormDraft) => McpFormDraft)) => void
  clearFieldError: (field: "command" | "environment") => void
  getFieldProps: (
    field: "command" | "environment",
    describedBy?: string,
  ) => {
    "aria-describedby": string | undefined
    "aria-errormessage": string | undefined
    "aria-invalid": true | undefined
  }
}

export function McpLocalFields(props: McpLocalFieldsProps) {
  return (
    <>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="mcp-command">
          Local command
        </label>
        <Textarea
          id="mcp-command"
          value={props.draft.command}
          onChange={(event) => {
            const value = event.target.value
            props.setDraft((current) => ({
              ...current,
              command: value,
            }))
            props.clearFieldError("command")
          }}
          placeholder={`[\n  "npx",\n  "-y",\n  "@modelcontextprotocol/server-filesystem",\n  "/path with spaces"\n]`}
          className="min-h-24"
          {...props.getFieldProps("command", "mcp-command-help")}
        />
        <p id="mcp-command-help" className="text-xs text-muted-foreground">
          Use a JSON array to preserve exact argv values, especially when arguments contain spaces. Plain text still
          works for simple commands.
        </p>
        {props.fieldErrors.command ? (
          <p id={getFieldErrorId("command")} className="text-xs text-destructive">
            {props.fieldErrors.command}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="mcp-environment">
          Environment (JSON)
        </label>
        <Textarea
          id="mcp-environment"
          value={props.draft.environmentText}
          onChange={(event) => {
            const value = event.target.value
            props.setDraft((current) => ({
              ...current,
              environmentText: value,
            }))
            props.clearFieldError("environment")
          }}
          placeholder={`{\n  "NODE_NO_WARNINGS": "1"\n}`}
          className="min-h-24"
          {...props.getFieldProps("environment")}
        />
        {props.fieldErrors.environment ? (
          <p id={getFieldErrorId("environment")} className="text-xs text-destructive">
            {props.fieldErrors.environment}
          </p>
        ) : null}
      </div>
    </>
  )
}
