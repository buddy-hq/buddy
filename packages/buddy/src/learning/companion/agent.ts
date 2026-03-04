import { createBuildAgent } from "../../agent-kit/factories.js"
import { registerBuddyAgent } from "../../agent-kit/register-buddy-agent.js"
import BUDDY_BASE_PROMPT from "./buddy-base.p.md"

export const BUDDY_AGENT = registerBuddyAgent({
  key: "buddy",
  agent: createBuildAgent({
    description: "The default Buddy mode for learning conversations and project help.",
    prompt: BUDDY_BASE_PROMPT.trim(),
    steps: 8,
    availableSubagents: ["curriculum-builder"],
    permission: {
      todoread: "deny",
      todowrite: "deny",
    },
  }),
})
