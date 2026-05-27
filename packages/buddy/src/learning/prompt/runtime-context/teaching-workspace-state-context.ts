import TEACHING_WORKSPACE_STATE_CONTEXT_TEMPLATE_SOURCE from "./teaching-workspace-state-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const TEACHING_WORKSPACE_STATE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: TEACHING_WORKSPACE_STATE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/teaching-workspace-state-context.t.md",
})

export const teachingWorkspaceStateSection = defineRuntimeSection({
  key: "teaching-workspace-state",
  render: (context) => {
    const teachingWorkspaceState = context.teachingWorkspaceState
    const hasEditor = context.visibleSurfaces.includes("editor")
    const hasFigure = context.visibleSurfaces.includes("figure")

    const guidance = hasEditor
      ? teachingWorkspaceState === "active"
        ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
        : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
      : hasFigure
        ? "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
        : "Teach through normal chat. Use learner state and project context to stay grounded."

    TEACHING_WORKSPACE_STATE_CONTEXT_TEMPLATE.render({
      workspace_state: teachingWorkspaceState,
      guidance,
    })

    //  disabled until we find a better use of workspace state in the runtime context
    return ""
  },
})
