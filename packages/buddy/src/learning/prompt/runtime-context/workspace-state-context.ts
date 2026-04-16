import WORKSPACE_STATE_CONTEXT_TEMPLATE_SOURCE from "./workspace-state-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const WORKSPACE_STATE_CONTEXT_TEMPLATE = definePromptTemplate({
  source: WORKSPACE_STATE_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/workspace-state-context.t.md",
})

export const workspaceStateSection = defineRuntimeSection({
  key: "workspace-state",
  render: (context) => {
    const workspaceState = context.workspaceState
    const hasEditor = context.visibleSurfaces.includes("editor")
    const hasFigure = context.visibleSurfaces.includes("figure")

    const guidance = hasEditor
      ? workspaceState === "interactive"
        ? "An interactive lesson workspace is active. Ground coding help in the live lesson files."
        : "No interactive lesson workspace is active. Teach in chat unless the learner explicitly wants an editor-backed lesson."
      : hasFigure
        ? "Teach primarily through chat. Render a figure only when it materially improves the current explanation."
        : "Teach through normal chat. Use learner state and project context to stay grounded."

    return WORKSPACE_STATE_CONTEXT_TEMPLATE.render({
      workspace_state: workspaceState,
      guidance,
    })
  },
})
