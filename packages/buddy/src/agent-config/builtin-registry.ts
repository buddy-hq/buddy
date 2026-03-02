import { z } from "zod"
import { Config } from "../config/config.js"
import { CURRICULUM_BUILDER_SUBAGENT } from "../learning/curriculum/subagent.js"
import { CODE_TEACHER_AGENT } from "../learning/teaching/agent.js"

const BuddyBuiltinAgentRegistrySchema = z.record(z.string(), Config.Agent)

const rawBuddyBuiltinAgentRegistry = {
  "code-teacher": CODE_TEACHER_AGENT,
  "curriculum-builder": CURRICULUM_BUILDER_SUBAGENT,
}

export const BUDDY_BUILTIN_AGENT_REGISTRY = BuddyBuiltinAgentRegistrySchema.parse(rawBuddyBuiltinAgentRegistry)
