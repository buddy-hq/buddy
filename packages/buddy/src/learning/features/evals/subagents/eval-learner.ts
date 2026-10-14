import { defineBuddySubagent } from "../../../runtime/define-buddy-subagent"
import EVAL_LEARNER_PROMPT from "./eval-learner.md"

const EVAL_LEARNER_AGENT_KEY = "eval-learner"

const EVAL_LEARNER_AGENT = defineBuddySubagent({
  key: EVAL_LEARNER_AGENT_KEY,
  delegatable: false,
  description: "Plays a simulated learner for Buddy's teaching evals in DevTools.",
  prompt: EVAL_LEARNER_PROMPT,
  permission: "deny",
})

export { EVAL_LEARNER_AGENT, EVAL_LEARNER_AGENT_KEY }
