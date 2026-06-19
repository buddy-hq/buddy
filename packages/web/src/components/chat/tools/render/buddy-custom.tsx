import { ToolAttachmentGallery } from "../tool-attachments"
import { HIDDEN_STEPS_ERROR_CLASS_NAME, HIDDEN_STEPS_TEXT_CLASS_NAME } from "../hidden-steps/styles"
import { titleFromToolName } from "../../utils/tool"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowDenied } from "../tool-row"
import { isPermissionDenied } from "../tool-permission"
import { readBuddyObjectResult } from "./buddy-object-result"
import type { ToolPartProps } from "../registry"

export function renderBuddyCustomTool({ state, tool, icon }: ToolPartProps) {
  const denied = isPermissionDenied(state)
  const output = state.output || (state.error ?? "")
  const hasContent = output.trim().length > 0
  const hasError = !denied && state.status === "error" && hasContent
  const result = readBuddyObjectResult(state.metadata)
  const objectSubject = result?.primaryRef?.kind
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <div className="flex flex-col gap-1.5">
      <ToolRow>
        <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
        <ToolRowAction>{titleFromToolName(tool)}</ToolRowAction>
        {objectSubject ? <ToolRowSubject>{objectSubject}</ToolRowSubject> : null}
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
