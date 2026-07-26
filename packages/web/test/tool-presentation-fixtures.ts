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
  return {
    version: 1,
    archetype: "activity",
    phase: input.phase,
    action: input.action,
    ...(input.detail ? { detail: input.detail } : {}),
    icon: input.icon ?? "tool",
    renderer: input.renderer ?? "generic",
    layoutRole: "activity",
    outcome: input.outcome ?? outcomeForPhase(input.phase),
    summary: {
      category: input.category,
      label: input.summary,
    },
  }
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
  return {
    version: 1,
    archetype: "inline-output",
    phase: input.phase,
    action: input.action,
    ...(input.detail ? { detail: input.detail } : {}),
    icon: input.icon ?? "tool",
    renderer: input.renderer,
    layoutRole: input.layoutRole,
    ...(input.activeDisplay ? { activeDisplay: input.activeDisplay } : {}),
    ...(input.collection ? { collection: input.collection } : {}),
    outcome: input.outcome ?? outcomeForPhase(input.phase),
  }
}

export function presentationMetadata(
  presentation: ToolPresentationSnapshot,
): Record<string, unknown> {
  return { buddy: { presentation } }
}
