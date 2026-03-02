import { z } from "zod"
import { Config } from "../config/config.js"
import { CODE_TEACHER_AGENT } from "./code-teacher.agent.js"
import { CURRICULUM_BUILDER_SUBAGENT } from "./curriculum-builder.subagent.js"

const BuddyAgentOverlaySchema = z.record(z.string(), Config.Agent)

const rawBuddyAgentOverlay = {
  "code-teacher": CODE_TEACHER_AGENT,
  "curriculum-builder": CURRICULUM_BUILDER_SUBAGENT,
}

export const BUDDY_AGENT_OVERLAY = BuddyAgentOverlaySchema.parse(rawBuddyAgentOverlay)
