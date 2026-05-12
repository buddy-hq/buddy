import { ToolAttachmentGallery } from "../tool-attachments"
import { HIDDEN_STEPS_ERROR_CLASS_NAME, HIDDEN_STEPS_TEXT_CLASS_NAME } from "../hidden-steps/styles"
import { language } from "@/context/language"
import { readNonEmptyString, readNonNegativeInt } from "../../tools/types"
import { titleFromToolName } from "../../utils/tool"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowDenied } from "../tool-row"
import { isPermissionDenied } from "../tool-permission"
import type { ToolPartProps } from "../registry"

export function renderBuddyCustomTool({ state, tool, icon }: ToolPartProps) {
  if (tool === "ingest_full_text") {
    const resource = readNonEmptyString(state.metadata.resource)
    const fullTextEstTokens = readNonNegativeInt(state.metadata.fullTextEstTokens)
    const denied = isPermissionDenied(state)
    const output = state.output || (state.error ?? "")
    const hasError = !denied && state.status === "error" && output.trim().length > 0

    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
          <ToolRowAction>{language.t("chatTools.fullText")}</ToolRowAction>
          {resource ? <ToolRowSubject>{resource}</ToolRowSubject> : null}
          {denied ? <ToolRowDenied /> : null}
        </ToolRow>
        {!denied && fullTextEstTokens !== undefined ? (
          <span className="pl-5 text-xs text-text-weaker">
            {language.t("chatTools.tokensLoaded", { count: fullTextEstTokens.toLocaleString() })}
          </span>
        ) : null}
        {hasError ? <pre className={HIDDEN_STEPS_ERROR_CLASS_NAME}>{output}</pre> : null}
      </div>
    )
  }

  const denied = isPermissionDenied(state)
  const output = state.output || (state.error ?? "")
  const hasContent = output.trim().length > 0
  const hasError = !denied && state.status === "error" && hasContent
  const artifact = readNonEmptyString(state.metadata.artifact)
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <div className="flex flex-col gap-1.5">
      <ToolRow>
        <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
        <ToolRowAction>{titleFromToolName(tool)}</ToolRowAction>
        {artifact ? <ToolRowSubject>{artifact}</ToolRowSubject> : null}
        {denied ? <ToolRowDenied /> : null}
      </ToolRow>
      {hasError ? (
        <pre className={`${HIDDEN_STEPS_ERROR_CLASS_NAME} max-h-60 overflow-auto`}>{output}</pre>
      ) : !denied && hasContent ? (
        <pre className={`${HIDDEN_STEPS_TEXT_CLASS_NAME} max-h-60 overflow-auto`}>{output}</pre>
      ) : null}
      {!denied && !hasContent && valueText ? (
        <pre className={`${HIDDEN_STEPS_TEXT_CLASS_NAME} max-h-60 overflow-auto`}>{valueText}</pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </div>
  )
}
