import { Textarea } from "@buddy/ui"
import { language } from "@/context/language"
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
        <label className="text-sm font-medium text-text-base" htmlFor="mcp-command">
          {language.t("mcp.localFields.commandLabel")}
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
          placeholder={language.t("mcp.localFields.commandPlaceholder")}
          className="min-h-24"
          {...props.getFieldProps("command", "mcp-command-help")}
        />
        <p id="mcp-command-help" className="text-xs text-text-weak">
          {language.t("mcp.localFields.commandHelp")}
        </p>
        {props.fieldErrors.command ? (
          <p id={getFieldErrorId("command")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.command}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-text-base" htmlFor="mcp-environment">
          {language.t("mcp.localFields.environmentLabel")}
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
          placeholder={language.t("mcp.localFields.environmentPlaceholder")}
          className="min-h-24"
          {...props.getFieldProps("environment")}
        />
        {props.fieldErrors.environment ? (
          <p id={getFieldErrorId("environment")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.environment}
          </p>
        ) : null}
      </div>
    </>
  )
}
