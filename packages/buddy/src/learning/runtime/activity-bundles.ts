import type {
  ActivityKind,
  ActivityBundleCapability,
  ActivityBundleDefinition,
  PersonaDefinition,
  SubagentAccess,
  SubagentId,
  TeachingIntentId,
  ToolId,
  WorkspaceState,
} from "./types.js"

const BUNDLED_ACTIVITY_BUNDLES: ActivityBundleDefinition[] = [
  {
    id: "learn-explanation",
    activity: "explanation",
    label: "Explanation",
    intent: "learn",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Introduce or clarify a concept just enough for the learner to move forward.",
    autoEligible: true,
    whenToUse: [
      "the learner asks to understand something before trying it",
      "a quick framing step will unlock practice",
    ],
    outputs: ["clear explanation", "next step toward practice"],
    skills: ["buddy-learn-explanation"],
    tools: ["activity_explanation"],
  },
  {
    id: "learn-worked-example",
    activity: "worked-example",
    label: "Worked Example",
    intent: "learn",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Show a complete example while making the reasoning explicit.",
    autoEligible: true,
    whenToUse: [
      "the learner needs to see the full shape of a solution before attempting one",
      "the concept is easier to teach through a concrete example than a definition",
    ],
    outputs: ["worked example", "bridge to guided practice"],
    skills: ["buddy-learn-worked-example"],
    tools: ["activity_worked_example"],
  },
  {
    id: "learn-concept-contrast",
    activity: "concept-contrast",
    label: "Concept Contrast",
    intent: "learn",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Differentiate two nearby ideas so the learner stops mixing them up.",
    autoEligible: true,
    whenToUse: [
      "the learner is confusing two related concepts or operations",
      "a boundary-setting comparison will reduce future mistakes",
    ],
    outputs: ["contrast table", "disambiguation cues"],
    skills: ["buddy-learn-concept-contrast"],
    tools: ["activity_concept_contrast"],
  },
  {
    id: "learn-analogy",
    activity: "analogy",
    label: "Analogy",
    intent: "learn",
    personas: ["buddy", "math-buddy"],
    mode: "hybrid",
    description: "Use a well-bounded analogy to make an abstract idea easier to grasp.",
    autoEligible: true,
    whenToUse: [
      "the learner needs a more intuitive mental model",
      "math or abstract reasoning would benefit from a familiar anchor",
    ],
    outputs: ["analogy", "limits of the analogy"],
    skills: ["buddy-learn-analogy"],
    tools: ["activity_analogy"],
    subagents: ["analogy-author"],
  },
  {
    id: "practice-guided",
    activity: "guided-practice",
    label: "Guided Practice",
    intent: "practice",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Run a structured attempt with tight scaffolding and immediate course correction.",
    autoEligible: true,
    whenToUse: [
      "the learner should perform the skill but still needs support",
      "the next best step is a structured attempt rather than more exposition",
    ],
    outputs: ["guided attempt", "practice evidence"],
    skills: ["buddy-practice-guided"],
    tools: ["activity_guided_practice", "practice_record"],
    subagents: ["practice-agent", "hint-generator"],
  },
  {
    id: "practice-independent",
    activity: "independent-practice",
    label: "Independent Practice",
    intent: "practice",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Give the learner a cleaner attempt with less scaffolding and collect evidence.",
    autoEligible: true,
    whenToUse: [
      "the learner has enough momentum to try with lighter support",
      "the session needs fresh evidence of independent performance",
    ],
    outputs: ["independent task", "practice evidence"],
    skills: ["buddy-practice-independent"],
    tools: ["activity_independent_practice", "practice_record"],
    subagents: ["practice-agent"],
  },
  {
    id: "code-debug-attempt",
    activity: "debug-attempt",
    label: "Debug Attempt",
    intent: "practice",
    personas: ["code-buddy"],
    mode: "hybrid",
    description: "Use the lesson workspace to debug a learner attempt and turn the fix into practice.",
    autoEligible: true,
    whenToUse: [
      "the learner already has code and is stuck on a concrete failure",
      "a live debugging loop will teach faster than a fresh explanation",
    ],
    outputs: ["debug plan", "workspace-backed practice evidence"],
    skills: ["buddy-practice-debug-attempt"],
    tools: ["activity_debug_attempt", "practice_record", "teaching_set_lesson", "teaching_checkpoint"],
    subagents: ["practice-agent", "feedback-engine"],
    workspaceStates: ["interactive"],
  },
  {
    id: "math-stepwise-solve",
    activity: "stepwise-solve",
    label: "Stepwise Solve",
    intent: "practice",
    personas: ["math-buddy"],
    mode: "hybrid",
    description: "Walk the learner through a structured mathematical solve while preserving their agency.",
    autoEligible: true,
    whenToUse: [
      "the learner needs orderly mathematical scaffolding",
      "a figure or intermediate checkpoints will make the solve clearer",
    ],
    outputs: ["stepwise solve", "practice evidence"],
    skills: ["buddy-practice-stepwise-solve"],
    tools: ["activity_stepwise_solve", "practice_record", "render_figure"],
    subagents: ["solution-checker"],
  },
  {
    id: "assess-mastery-check",
    activity: "mastery-check",
    label: "Mastery Check",
    intent: "assess",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Run a concise evidence-first check and decide the next teaching move from the result.",
    autoEligible: true,
    whenToUse: [
      "the learner appears ready for a direct check",
      "the session needs a clear decision about whether to advance or repair",
    ],
    outputs: ["check prompt", "assessment evidence", "follow-up action"],
    skills: ["buddy-assess-mastery-check"],
    tools: ["activity_mastery_check", "assessment_record"],
    subagents: ["assessment-agent", "rubric-grader"],
  },
  {
    id: "assess-reflection",
    activity: "reflection",
    label: "Reflection",
    intent: "assess",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Ask the learner to explain their reasoning and surface gaps before moving on.",
    autoEligible: true,
    whenToUse: [
      "metacognitive reflection will reveal whether the learner actually understands",
      "you want an explanation of thinking rather than a binary right or wrong",
    ],
    outputs: ["reflection prompt", "reasoning summary"],
    skills: ["buddy-assess-reflection"],
    tools: ["activity_reflection"],
  },
  {
    id: "assess-retrieval-check",
    activity: "retrieval-check",
    label: "Retrieval Check",
    intent: "assess",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Check whether the learner can recall and apply the idea without heavy prompting.",
    autoEligible: true,
    whenToUse: [
      "the learner has recently studied the concept and needs a quick recall check",
      "a lightweight check is enough before deciding whether to practice more",
    ],
    outputs: ["retrieval prompt", "assessment evidence"],
    skills: ["buddy-assess-retrieval-check"],
    tools: ["activity_retrieval_check", "assessment_record"],
    subagents: ["assessment-agent"],
  },
  {
    id: "assess-transfer-check",
    activity: "transfer-check",
    label: "Transfer Check",
    intent: "assess",
    personas: ["buddy", "code-buddy", "math-buddy"],
    mode: "hybrid",
    description: "Probe whether the learner can transfer the skill to a slightly different setting.",
    autoEligible: true,
    whenToUse: [
      "the learner looks competent on the core case and needs a transfer challenge",
      "you want to know whether understanding survives a changed context",
    ],
    outputs: ["transfer task", "assessment evidence"],
    skills: ["buddy-assess-transfer-check"],
    tools: ["activity_transfer_check", "assessment_record"],
    subagents: ["assessment-agent"],
  },
]

const BUNDLED_ACTIVITY_SKILL_NAMES = Array.from(
  new Set(BUNDLED_ACTIVITY_BUNDLES.flatMap((bundle) => bundle.skills ?? [])),
).sort((left, right) => left.localeCompare(right))

const BUNDLED_ACTIVITY_TOOL_NAMES = Array.from(
  new Set(
    BUNDLED_ACTIVITY_BUNDLES.flatMap((bundle) => (bundle.tools ?? []).filter((toolId) => toolId.startsWith("activity_"))),
  ),
).sort((left, right) => left.localeCompare(right)) as ToolId[]

function bundleMatchesIntent(bundle: ActivityBundleDefinition, intentOverride?: TeachingIntentId) {
  return !intentOverride || bundle.intent === intentOverride
}

function bundleMatchesPersona(bundle: ActivityBundleDefinition, persona: PersonaDefinition) {
  return bundle.personas.includes(persona.id)
}

function bundleMatchesWorkspace(bundle: ActivityBundleDefinition, workspaceState: WorkspaceState) {
  return !bundle.workspaceStates || bundle.workspaceStates.includes(workspaceState)
}

function resolveBundleTools(input: {
  bundle: ActivityBundleDefinition
  tools: Record<ToolId, "allow" | "deny">
}) {
  return (input.bundle.tools ?? []).filter((toolId) => input.tools[toolId] === "allow")
}

function resolveBundleSubagents(input: {
  bundle: ActivityBundleDefinition
  subagents: Record<SubagentId, SubagentAccess>
}) {
  return (input.bundle.subagents ?? []).filter((subagentId) => input.subagents[subagentId] && input.subagents[subagentId] !== "deny")
}

function resolveBundleCapabilities(input: {
  bundle: ActivityBundleDefinition
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, SubagentAccess>
}): ActivityBundleCapability {
  return {
    id: input.bundle.id,
    activity: input.bundle.activity,
    label: input.bundle.label,
    intent: input.bundle.intent,
    mode: input.bundle.mode,
    description: input.bundle.description,
    autoEligible: input.bundle.autoEligible,
    whenToUse: [...input.bundle.whenToUse],
    outputs: [...(input.bundle.outputs ?? [])],
    skills: [...(input.bundle.skills ?? [])],
    tools: resolveBundleTools({
      bundle: input.bundle,
      tools: input.tools,
    }),
    subagents: resolveBundleSubagents({
      bundle: input.bundle,
      subagents: input.subagents,
    }),
  }
}

export function resolveActivityBundles(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, SubagentAccess>
}): ActivityBundleCapability[] {
  return BUNDLED_ACTIVITY_BUNDLES
    .filter((bundle) => bundleMatchesPersona(bundle, input.persona))
    .filter((bundle) => bundleMatchesIntent(bundle, input.intentOverride))
    .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))
    .map((bundle) => resolveBundleCapabilities({
      bundle,
      tools: input.tools,
      subagents: input.subagents,
    }))
}

export function resolveBundledSkillPermissions(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
}): Record<string, "allow" | "deny"> {
  const allowedSkillNames = new Set(
    BUNDLED_ACTIVITY_BUNDLES
      .filter((bundle) => bundleMatchesPersona(bundle, input.persona))
      .filter((bundle) => bundleMatchesIntent(bundle, input.intentOverride))
      .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))
      .flatMap((bundle) => bundle.skills ?? []),
  )

  return Object.fromEntries(
    BUNDLED_ACTIVITY_SKILL_NAMES.map((skillName) => [skillName, allowedSkillNames.has(skillName) ? "allow" : "deny"]),
  )
}

export function resolveBundledActivityToolPermissions(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
}): Partial<Record<ToolId, "allow" | "deny">> {
  const allowedToolNames = new Set(
    BUNDLED_ACTIVITY_BUNDLES
      .filter((bundle) => bundleMatchesPersona(bundle, input.persona))
      .filter((bundle) => bundleMatchesIntent(bundle, input.intentOverride))
      .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))
      .flatMap((bundle) => (bundle.tools ?? []).filter((toolId) => toolId.startsWith("activity_"))),
  )

  return Object.fromEntries(
    BUNDLED_ACTIVITY_TOOL_NAMES.map((toolName) => [toolName, allowedToolNames.has(toolName) ? "allow" : "deny"]),
  ) as Partial<Record<ToolId, "allow" | "deny">>
}

export function bundledActivityBundles() {
  return [...BUNDLED_ACTIVITY_BUNDLES]
}

export function bundledActivitySkillNames() {
  return [...BUNDLED_ACTIVITY_SKILL_NAMES]
}

export function findActivityBundleById(id: string) {
  return BUNDLED_ACTIVITY_BUNDLES.find((bundle) => bundle.id === id)
}

export function resolvePreferredActivityBundle(input: {
  persona: PersonaDefinition
  intent: TeachingIntentId
  activity?: ActivityKind
  workspaceState: WorkspaceState
}): ActivityBundleDefinition | undefined {
  const candidates = BUNDLED_ACTIVITY_BUNDLES
    .filter((bundle) => bundle.intent === input.intent)
    .filter((bundle) => bundle.personas.includes(input.persona.id))
    .filter((bundle) => bundle.autoEligible)
    .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))

  if (input.activity) {
    const exact = candidates.find((bundle) => bundle.activity === input.activity)
    if (exact) return exact
  }

  return candidates[0]
}
