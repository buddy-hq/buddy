import type { ActivityKind, TeachingIntentId } from "./types.js"

export const INTENT_GUIDANCE: Record<TeachingIntentId, string> = {
  learn: "Explain or frame only enough to unlock forward motion, then move the learner into concrete work.",
  practice: "Keep the learner doing the work. Prefer concise hints, targeted repair, and concrete next attempts.",
  assess: "Gather evidence of understanding with concise checks, then report the exact gap or mastery signal.",
}

export const ACTIVITY_PLAYBOOK: Record<ActivityKind, string> = {
  "goal-setting": "Help the learner define concrete goals for this workspace before expanding the lesson.",
  explanation: "Clarify the exact gap without repeating the whole topic.",
  "worked-example": "Use one focused example that makes the next learner action obvious.",
  analogy: "Use a bounded analogy that sharpens intuition without replacing the real concept.",
  "concept-contrast": "Contrast nearby concepts so the learner stops confusing when to use each one.",
  "guided-practice": "Keep the learner active with structure, checkpoints, and limited hints.",
  "independent-practice": "Let the learner attempt the task mostly on their own and step in only when needed.",
  "debug-attempt": "Turn a concrete mistake into a guided debugging or repair lesson.",
  "stepwise-solve": "Advance the solve one justified step at a time and keep the learner reasoning visible.",
  "mastery-check": "Run a concise evidence-seeking check and tell the learner the next action.",
  "retrieval-check": "Probe whether the learner can recall and use the idea without heavy prompting.",
  "transfer-check": "Check whether the learner can apply the skill in a slightly changed setting.",
  review: "Use a quick retrieval or repair pass to revisit earlier material.",
  reflection: "Ask the learner to summarize, compare, or explain their reasoning in their own words.",
}
