import { pickPrimaryGoal, summarizeLearnerContext } from "./catalog/context"
import { createActivityTool } from "./catalog/factory"
import { formatActivityOutput } from "./catalog/output"
import type { ActivityToolContext, ActivityToolParams } from "./catalog/contracts"

const activityExplanationTool = createActivityTool({
  id: "activity_explanation",
  intent: "learn",
  description: "Build a concise explanation plan grounded in the current learner state and active goals.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_explanation",
      intent: "learn",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Teaching plan", [
          `State ${target} in plain language before using jargon.`,
          `Connect the explanation to ${goal?.task ?? "the learner's current task"}.`,
          "Use only one compact example if it removes confusion.",
        ]],
        ["Suggested next turn", [
          `Explain ${target} directly, then bridge to one concrete next action.`,
        ]],
        ["Bridge", [
          goal ? `End by inviting either guided practice or a short check for: ${goal.howToTest}.` : "End by inviting a concrete next step.",
        ]],
      ],
    })
  },
})

const activityWorkedExampleTool = createActivityTool({
  id: "activity_worked_example",
  intent: "learn",
  description: "Build a worked-example teaching plan for the current learning goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_worked_example",
      intent: "learn",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Example frame", [
          `Choose one representative example for ${target}.`,
          "Solve it step by step and name the reasoning at each step.",
          goal ? `Call out the reusable pattern that would let the learner satisfy: ${goal.howToTest}.` : "Call out the reusable pattern the learner should copy.",
        ]],
        ["Suggested next turn", [
          `Show one complete worked example for ${target}, then invite a guided attempt.`,
        ]],
      ],
    })
  },
})

const activityConceptContrastTool = createActivityTool({
  id: "activity_concept_contrast",
  intent: "learn",
  description: "Build a concept-contrast teaching plan for two nearby ideas.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const conceptA = params.conceptA ?? goal?.statement ?? params.topic ?? context.workspaceLabel
    const conceptB = params.conceptB ?? "the closest confusing alternative"
    return formatActivityOutput({
      id: "activity_concept_contrast",
      intent: "learn",
      goalLabel: `${conceptA} vs ${conceptB}`,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Contrast plan", [
          `Name ${conceptA} and ${conceptB} explicitly.`,
          "Contrast their purpose, shape, and common failure cases.",
          "End with one memory cue the learner can reuse later.",
        ]],
        ["Suggested next turn", [
          `Give a crisp comparison between ${conceptA} and ${conceptB}, grounded in the current learning goal.`,
        ]],
      ],
    })
  },
})

const activityAnalogyTool = createActivityTool({
  id: "activity_analogy",
  intent: "learn",
  description: "Build a bounded-analogy teaching plan for the current learning goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    const analogyDomain = params.analogyDomain ?? "a familiar everyday system"
    return formatActivityOutput({
      id: "activity_analogy",
      intent: "learn",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Analogy plan", [
          `Choose one bounded analogy from ${analogyDomain}.`,
          `Map the analogy to ${target}.`,
          "State where the analogy breaks so it does not create misconceptions.",
        ]],
        ["Suggested next turn", [
          `Use one bounded analogy to make ${target} easier to grasp, then return to the real concept.`,
        ]],
      ],
    })
  },
})

const activityGuidedPracticeTool = createActivityTool({
  id: "activity_guided_practice",
  intent: "practice",
  description: "Generate a guided-practice plan for the active learning goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_guided_practice",
      intent: "practice",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Practice task", [
          goal ? `Ask the learner to perform: ${goal.task}.` : `Ask for one concrete step toward ${target}.`,
          goal ? `Success signal: ${goal.howToTest}.` : "Success signal: a concrete learner step with reasoning.",
        ]],
        ["Hint ladder", [
          "Hint 1: restate the target and the next smallest step.",
          "Hint 2: narrow the subproblem or show the expected shape of the answer.",
          "Hint 3: reveal one concrete correction, then return agency to the learner.",
        ]],
        ["Suggested next turn", [
          `Run guided practice for ${target} with one step at a time and minimal corrective feedback.`,
        ]],
      ],
    })
  },
})

const activityIndependentPracticeTool = createActivityTool({
  id: "activity_independent_practice",
  intent: "practice",
  description: "Generate an independent-practice task for the active learning goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_independent_practice",
      intent: "practice",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Practice task", [
          goal ? `Assign one focused task: ${goal.task}.` : `Assign one focused task for ${target}.`,
          goal ? `Expected deliverable: ${goal.howToTest}.` : "Expected deliverable: one complete learner attempt.",
        ]],
        ["Teacher stance", [
          "State the deliverable and success criteria clearly.",
          "Hold back hints until the learner responds or asks.",
        ]],
        ["Suggested next turn", [
          `Assign one clean independent attempt for ${target} with explicit success criteria.`,
        ]],
      ],
    })
  },
})

const activityDebugAttemptTool = createActivityTool({
  id: "activity_debug_attempt",
  intent: "practice",
  description: "Generate a structured debug-attempt plan for code practice.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? "the current code path"
    return formatActivityOutput({
      id: "activity_debug_attempt",
      intent: "practice",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Debug loop", [
          "Identify the failing behavior before proposing a fix.",
          "Inspect the smallest relevant code region first.",
          "Run one hypothesis and one fix at a time.",
        ]],
        ["Workspace hooks", [
          "Use the lesson workspace tools when you need to point at the right file or checkpoint accepted work.",
        ]],
        ["Suggested next turn", [
          `Turn the learner's bug into a structured debugging lesson for ${target}.`,
        ]],
      ],
    })
  },
})

const activityStepwiseSolveTool = createActivityTool({
  id: "activity_stepwise_solve",
  intent: "practice",
  description: "Generate a stepwise mathematical solve plan for the active goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_stepwise_solve",
      intent: "practice",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Solve plan", [
          `Restate the target quantity or proof goal for ${target}.`,
          "Ask for the next justified step, not the whole solve.",
          "Use a figure only if it materially reduces ambiguity.",
        ]],
        ["Suggested next turn", [
          `Coach a stepwise solve for ${target} without taking over the full solution.`,
        ]],
      ],
    })
  },
})

const activityMasteryCheckTool = createActivityTool({
  id: "activity_mastery_check",
  intent: "assess",
  description: "Generate a concise mastery check with evidence criteria for the active goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_mastery_check",
      intent: "assess",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Check prompt", [
          goal ? `Ask for a concise demonstration of: ${goal.howToTest}.` : `Ask for one concise demonstration of ${target}.`,
        ]],
        ["Evidence criteria", [
          goal ? goal.howToTest : `Can the learner independently demonstrate ${target}?`,
          "Require a visible reasoning signal, not just the final answer.",
        ]],
        ["Decision rule", [
          "If the learner meets the evidence criteria, advance or reduce support.",
          "If not, assign repair practice immediately.",
        ]],
      ],
    })
  },
})

const activityReflectionTool = createActivityTool({
  id: "activity_reflection",
  intent: "assess",
  description: "Generate a reflection-based assessment prompt for the active goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_reflection",
      intent: "assess",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Reflection prompt", [
          `Ask the learner to explain how they would approach ${target}.`,
          "Probe one assumption, gap, or confidence claim.",
        ]],
        ["Interpretation", [
          "Look for grounded reasoning, not confidence theater.",
          "Choose the next move from the learner's explanation quality.",
        ]],
      ],
    })
  },
})

const activityRetrievalCheckTool = createActivityTool({
  id: "activity_retrieval_check",
  intent: "assess",
  description: "Generate a lightweight retrieval check for the active goal.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_retrieval_check",
      intent: "assess",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Check prompt", [
          `Ask the learner to recall or apply ${target} without heavy prompting.`,
          "Keep the prompt narrow enough to isolate the target idea.",
        ]],
        ["Interpretation", [
          "Judge whether the learner can retrieve and use the concept unaided.",
        ]],
      ],
    })
  },
})

const activityTransferCheckTool = createActivityTool({
  id: "activity_transfer_check",
  intent: "assess",
  description: "Generate a transfer check that changes one meaningful condition.",
  buildOutput: (params: ActivityToolParams, context: ActivityToolContext) => {
    const goal = pickPrimaryGoal(context)
    const target = goal?.statement ?? params.topic ?? context.workspaceLabel
    return formatActivityOutput({
      id: "activity_transfer_check",
      intent: "assess",
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Transfer challenge", [
          `Change one meaningful condition around ${target}.`,
          "Ask the learner to adapt the idea to that new setting.",
        ]],
        ["Interpretation", [
          "Use the result to decide whether understanding survives context changes.",
        ]],
      ],
    })
  },
})

export {
  activityAnalogyTool,
  activityConceptContrastTool,
  activityDebugAttemptTool,
  activityExplanationTool,
  activityGuidedPracticeTool,
  activityIndependentPracticeTool,
  activityMasteryCheckTool,
  activityReflectionTool,
  activityRetrievalCheckTool,
  activityStepwiseSolveTool,
  activityTransferCheckTool,
  activityWorkedExampleTool,
}
