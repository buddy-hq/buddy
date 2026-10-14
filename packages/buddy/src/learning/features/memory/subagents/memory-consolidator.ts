import { defineBuddySubagent } from "../../../runtime/define-buddy-subagent"
import LEARNER_MEMORY_CONSOLIDATOR_PROMPT from "./memory-consolidator.md"

const LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY = "learner-memory-consolidator"

const LEARNER_MEMORY_CONSOLIDATOR_AGENT = defineBuddySubagent({
  key: LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY,
  delegatable: false,
  description: "Consolidates learner-memory extraction outputs into durable memory decisions.",
  prompt: LEARNER_MEMORY_CONSOLIDATOR_PROMPT,
  permission: {
    "*": "deny",
    subagent: "deny",
    read: "allow",
    glob: "allow",
    list: "deny",
    grep: "allow",
    shell: "deny",
    webfetch: "deny",
    websearch: "deny",
    codesearch: "deny",
    skill: "deny",
    lsp: "deny",
    batch: "deny",
    edit: "allow",
  },
})

export { LEARNER_MEMORY_CONSOLIDATOR_AGENT, LEARNER_MEMORY_CONSOLIDATOR_AGENT_KEY }
