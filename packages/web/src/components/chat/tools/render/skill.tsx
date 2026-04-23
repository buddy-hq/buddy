import { Badge } from "@buddy/ui"
import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolAttachmentGallery } from "../tool-attachments"
import { language } from "@/context/language"
import { readNonEmptyString } from "../../tools/types"
import type { ToolPartProps } from "../registry"

function parseSkillName(output?: string): string | undefined {
  if (!output) return undefined
  const match = output.match(/<skill_content name="([^"]+)">/)
  return match?.[1]
}

function parseSkillContent(output?: string): string {
  if (!output) return ""
  const match = output.match(/<skill_content name="[^"]+">([\s\S]*?)<\/skill_content>/)
  if (!match?.[1]) return output
  return match[1].trim()
}

export function renderSkillTool({ state }: ToolPartProps) {
  const skillName =
    readNonEmptyString(state.metadata.name) ??
    readNonEmptyString(state.input.name) ??
    readNonEmptyString(parseSkillName(state.output))
  const parsedContent = parseSkillContent(state.output)
  const hasContent = parsedContent.trim().length > 0
  const output = parsedContent || (state.error ?? "")
  const hasError = state.status === "error" && output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.skill"), subtitle: skillName }}
      status={state.status}
      defaultOpen={state.status === "error"}
    >
      {skillName ? (
        <div>
          <Badge variant="outline" className="text-xs text-text-weak">
            {skillName}
          </Badge>
        </div>
      ) : null}
      {hasError ? (
        <ToolErrorPanel error={output} />
      ) : hasContent ? (
        <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copySkill")} />
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}
