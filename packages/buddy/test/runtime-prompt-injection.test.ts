import { describe, expect, test } from "bun:test"
import { resolvePromptInjectionDecision } from "../src/learning/runtime/prompt-injection.js"
import type { RuntimePromptSection } from "../src/learning/runtime/types.js"

function section(input: {
  kind: RuntimePromptSection["kind"]
  label: string
  text: string
}): RuntimePromptSection {
  return {
    kind: input.kind,
    label: input.label,
    text: input.text,
  }
}

function buildSections(input?: {
  learnerSummary?: string
  feedback?: string
  selectedActivity?: string
}) {
  const stableHeaderSections = [
    section({
      kind: "persona-header",
      label: "Persona Header",
      text: "<persona>code-buddy</persona>",
    }),
    section({
      kind: "teaching-principles",
      label: "Teaching Principles",
      text: "<principles>teach clearly</principles>",
    }),
  ]

  const turnContextSections = [
    section({
      kind: "workspace-state",
      label: "Workspace State",
      text: "<workspace_state>chat</workspace_state>",
    }),
    section({
      kind: "explicit-overrides",
      label: "Explicit Overrides",
      text: "<explicit_overrides>intent=auto</explicit_overrides>",
    }),
    section({
      kind: "learner-summary",
      label: "Learner Summary",
      text: input?.learnerSummary ?? "<learner_state>goal_1</learner_state>",
    }),
    section({
      kind: "turn-cautions",
      label: "Turn Cautions",
      text: "<turn_cautions>verify completion claims</turn_cautions>",
    }),
  ]

  if (input?.feedback) {
    turnContextSections.push(
      section({
        kind: "feedback-summary",
        label: "Feedback Summary",
        text: input.feedback,
      }),
    )
  }

  if (input?.selectedActivity) {
    turnContextSections.push(
      section({
        kind: "selected-activity",
        label: "Selected Activity Bundle",
        text: input.selectedActivity,
      }),
    )
  }

  return {
    stableHeaderSections,
    turnContextSections,
  }
}

describe("resolvePromptInjectionDecision", () => {
  test("injects full stable header and full turn context on first turn when no cache exists", () => {
    const sections = buildSections()
    const decision = resolvePromptInjectionDecision({
      stableHeaderSections: sections.stableHeaderSections,
      turnContextSections: sections.turnContextSections,
    })

    expect(decision.injectStableHeader).toBe(true)
    expect(decision.injectTurnContext).toBe(true)
    expect(decision.stableHeader).toContain("<persona>code-buddy</persona>")
    expect(decision.stableHeader).toContain("<principles>teach clearly</principles>")
    expect(decision.turnContext).toContain("Workspace State:")
    expect(decision.turnContext).toContain("Learner Summary:")
  })

  test("injects only changed turn sections plus always-included caution sections", () => {
    const initial = buildSections({
      learnerSummary: "<learner_state>goal_1</learner_state>",
    })
    const first = resolvePromptInjectionDecision({
      stableHeaderSections: initial.stableHeaderSections,
      turnContextSections: initial.turnContextSections,
    })
    const next = buildSections({
      learnerSummary: "<learner_state>goal_1, goal_2</learner_state>",
    })
    const decision = resolvePromptInjectionDecision({
      previous: first.cache,
      stableHeaderSections: next.stableHeaderSections,
      turnContextSections: next.turnContextSections,
      policy: {
        alwaysIncludeTurnContextKinds: ["turn-cautions"],
      },
    })

    expect(decision.injectStableHeader).toBe(false)
    expect(decision.injectTurnContext).toBe(true)
    expect(decision.turnContext).toContain("Learner Summary:")
    expect(decision.turnContext).toContain("Turn Cautions:")
    expect(decision.turnContext).not.toContain("Workspace State:")
  })

  test("forces full turn snapshot when a previously injected section is removed", () => {
    const withFeedback = buildSections({
      feedback: "<feedback>retry proof</feedback>",
    })
    const first = resolvePromptInjectionDecision({
      stableHeaderSections: withFeedback.stableHeaderSections,
      turnContextSections: withFeedback.turnContextSections,
    })
    const withoutFeedback = buildSections()
    const decision = resolvePromptInjectionDecision({
      previous: first.cache,
      stableHeaderSections: withoutFeedback.stableHeaderSections,
      turnContextSections: withoutFeedback.turnContextSections,
    })

    expect(decision.injectTurnContext).toBe(true)
    expect(decision.turnContext).toContain("Workspace State:")
    expect(decision.turnContext).toContain("Learner Summary:")
    expect(decision.turnContext).not.toContain("Feedback Summary:")
  })

  test("forces selected activity and explicit overrides when activity bundle is explicitly requested", () => {
    const sections = buildSections({
      selectedActivity: "<selected_activity_bundle>debug challenge</selected_activity_bundle>",
    })
    const seed = resolvePromptInjectionDecision({
      stableHeaderSections: sections.stableHeaderSections,
      turnContextSections: sections.turnContextSections,
    })
    const decision = resolvePromptInjectionDecision({
      previous: seed.cache,
      stableHeaderSections: sections.stableHeaderSections,
      turnContextSections: sections.turnContextSections,
      policy: {
        forceTurnContextKinds: ["selected-activity", "explicit-overrides"],
      },
    })

    expect(decision.injectStableHeader).toBe(false)
    expect(decision.injectTurnContext).toBe(true)
    expect(decision.turnContext).toContain("Selected Activity Bundle:")
    expect(decision.turnContext).toContain("Explicit Overrides:")
  })
})
