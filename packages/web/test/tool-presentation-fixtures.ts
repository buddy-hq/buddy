import type {
  ToolActionIcon,
  ToolCollectionToken,
  ToolLayoutRole,
  ToolPresentationOutcome,
  ToolPresentationPhase,
  ToolPresentationSnapshot,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"

function outcomeForPhase(phase: ToolPresentationPhase): ToolPresentationOutcome {
  if (phase === "pending" || phase === "running") return { type: "active" }
  if (phase === "completed") return { type: "success" }
  return { type: "failure" }
}

export function activityPresentation(input: {
  phase: ToolPresentationPhase
  action: string
  detail?: string
  category: string
  summary: string
  icon?: ToolActionIcon
  renderer?: ToolRendererToken
  outcome?: ToolPresentationOutcome
}): Extract<ToolPresentationSnapshot, { archetype: "activity" }> {
  return Object.assign(
    {
      version: 1 as const,
      archetype: "activity" as const,
      phase: input.phase,
      action: input.action,
      icon: input.icon ?? "tool",
      renderer: input.renderer ?? "generic",
      layoutRole: "activity" as const,
      outcome: input.outcome ?? outcomeForPhase(input.phase),
      summary: {
        category: input.category,
        label: input.summary,
      },
    },
    input.detail === undefined ? undefined : { detail: input.detail },
  )
}

export function inlinePresentation(input: {
  phase: ToolPresentationPhase
  action: string
  renderer: ToolRendererToken
  layoutRole: Exclude<ToolLayoutRole, "prose" | "activity">
  detail?: string
  icon?: ToolActionIcon
  collection?: ToolCollectionToken
  activeDisplay?: "activity"
  outcome?: ToolPresentationOutcome
}): Extract<ToolPresentationSnapshot, { archetype: "inline-output" }> {
  return Object.assign(
    {
      version: 1 as const,
      archetype: "inline-output" as const,
      phase: input.phase,
      action: input.action,
      icon: input.icon ?? "tool",
      renderer: input.renderer,
      layoutRole: input.layoutRole,
      outcome: input.outcome ?? outcomeForPhase(input.phase),
    },
    input.detail === undefined ? undefined : { detail: input.detail },
    input.activeDisplay === undefined ? undefined : { activeDisplay: input.activeDisplay },
    input.collection === undefined ? undefined : { collection: input.collection },
  )
}

export function presentationMetadata(
  presentation: ToolPresentationSnapshot,
) {
  return { buddy: { presentation } }
}
