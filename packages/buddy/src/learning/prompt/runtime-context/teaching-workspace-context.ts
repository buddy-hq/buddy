import TEACHING_WORKSPACE_CONTEXT_TEMPLATE_SOURCE from "./teaching-workspace-context.t.md"
import TEACHING_WORKSPACE_POLICY from "../teaching-workspace-policy.p.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const TEACHING_WORKSPACE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: TEACHING_WORKSPACE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/teaching-workspace-context.t.md",
})

export async function getCheckpointStatus(directory: string, sessionID: string) {
  const { TeachingService } = await import("../../capabilities/lesson-workspace/service/operations")
  return TeachingService.status(directory, sessionID).catch(() => undefined)
}

export const teachingPolicySection = defineRuntimeSection({
  key: "teaching-policy",
  when: (context) => context.hasEditor,
  render: () => TEACHING_WORKSPACE_POLICY,
})

export const teachingWorkspaceSection = defineRuntimeSection({
  key: "teaching-workspace",
  when: (context) => context.teachingContext?.active === true && context.hasEditor,
  render: (context) => {
    const teachingContext = context.teachingContext!
    const checkpointStatus = context.checkpointStatus
    const optionalLines: string[] = []

    if (checkpointStatus) {
      optionalLines.push(
        `Checkpoint status: ${checkpointStatus.changedSinceLastCheckpoint ? "pending acceptance" : "accepted"}`,
      )
    }
    if (checkpointStatus?.trackedFiles.length) {
      optionalLines.push("Tracked files:")
      optionalLines.push(...checkpointStatus.trackedFiles.map((file) => `- ${file}`))
    }
    if (
      teachingContext.selectionStartLine !== undefined &&
      teachingContext.selectionStartColumn !== undefined &&
      teachingContext.selectionEndLine !== undefined &&
      teachingContext.selectionEndColumn !== undefined
    ) {
      optionalLines.push(
        `Selection: L${teachingContext.selectionStartLine}:C${teachingContext.selectionStartColumn}-L${teachingContext.selectionEndLine}:C${teachingContext.selectionEndColumn}`,
      )
    }

    return TEACHING_WORKSPACE_CONTEXT_TEMPLATE.render({
      session_id: teachingContext.sessionID,
      lesson_file_path: teachingContext.lessonFilePath,
      checkpoint_file_path: teachingContext.checkpointFilePath,
      language: teachingContext.language,
      revision: `${teachingContext.revision}`,
      optional_sections: optionalLines.length > 0 ? `${optionalLines.join("\n")}\n` : "",
    })
  },
})
