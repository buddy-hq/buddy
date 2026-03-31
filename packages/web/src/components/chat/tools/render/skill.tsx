import { Badge } from "@buddy/ui"
import { BasicTool, ToolOutputPanel, ToolAttachmentGallery } from "../../shared"
import { language } from "@/context/language"
import { readNonEmptyString } from "../../shared/utils"
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
  const showOutput = parsedContent.trim().length > 0 || !!state.error
  const output = parsedContent || (state.error ?? "")

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.skill"), subtitle: skillName }}
      status={state.status}
      defaultOpen={false}
    >
      {skillName ? (
        <div>
          <Badge variant="outline" className="text-xs text-text-weak">
            {skillName}
          </Badge>
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel
          output={output}
          status={state.status}
          copyLabel={language.t("chatTools.copySkill")}
        />
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}
