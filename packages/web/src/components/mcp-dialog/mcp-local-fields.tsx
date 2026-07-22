import { Textarea, Field, FieldLabel } from "@buddy/ui"
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
      <Field className="space-y-1.5">
        <FieldLabel className="text-xs font-medium text-text-weak" htmlFor="mcp-command">
          {language.t("mcp.localFields.commandLabel")}
        </FieldLabel>
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
          className="min-h-24 text-sm px-3 py-2 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
          {...props.getFieldProps("command", "mcp-command-help")}
        />
        <p id="mcp-command-help" className="text-[11px] text-text-weak leading-normal">
          {language.t("mcp.localFields.commandHelp")}
        </p>
        {props.fieldErrors.command ? (
          <p id={getFieldErrorId("command")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.command}
          </p>
        ) : null}
      </Field>

      <Field className="space-y-1.5">
        <FieldLabel className="text-xs font-medium text-text-weak" htmlFor="mcp-environment">
          {language.t("mcp.localFields.environmentLabel")}
        </FieldLabel>
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
          className="min-h-24 text-sm px-3 py-2 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
          {...props.getFieldProps("environment")}
        />
        {props.fieldErrors.environment ? (
          <p id={getFieldErrorId("environment")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.environment}
          </p>
        ) : null}
      </Field>
    </>
  )
}
