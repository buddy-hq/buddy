import { z } from "zod"
import { Config } from "../config/config.js"

export type BuddyAgentMeta = {
  role: "companion" | "teacher" | "curriculum-builder" | "goal-writer"
  subject?: "coding" | "math"
  interactiveWorkspace: boolean
  teachingTools: boolean
  teachingPolicyMode: "none" | "interactive"
  supportsInlineFigures: boolean
  includeLearningCompanionBehavior: boolean
  recommendedTeacherName?: string
}

type BuddyAgentRegistration = {
  key: string
  agent: z.input<typeof Config.Agent>
  meta?: BuddyAgentMeta
}

type RegisteredBuddyAgent = {
  key: string
  agent: Config.Agent
  meta: BuddyAgentMeta
}

const registeredBuddyAgents = new Map<string, Config.Agent>()
const registeredBuddyAgentMeta = new Map<string, BuddyAgentMeta>()

function defaultBuddyAgentMeta(input: { key?: string } = {}): BuddyAgentMeta {
  if (input.key === "code-teacher") {
    return {
      role: "teacher",
      subject: "coding",
      interactiveWorkspace: true,
      teachingTools: true,
      teachingPolicyMode: "interactive",
      supportsInlineFigures: false,
      includeLearningCompanionBehavior: false,
      recommendedTeacherName: "code-teacher",
    }
  }

  if (input.key === "math-teacher") {
    return {
      role: "teacher",
      subject: "math",
      interactiveWorkspace: false,
      teachingTools: false,
      teachingPolicyMode: "none",
      supportsInlineFigures: true,
      includeLearningCompanionBehavior: false,
      recommendedTeacherName: "math-teacher",
    }
  }

  if (input.key === "curriculum-builder") {
    return {
      role: "curriculum-builder",
      interactiveWorkspace: false,
      teachingTools: false,
      teachingPolicyMode: "none",
      supportsInlineFigures: false,
      includeLearningCompanionBehavior: true,
      recommendedTeacherName: "code-teacher",
    }
  }

  if (input.key === "goal-writer") {
    return {
      role: "goal-writer",
      interactiveWorkspace: false,
      teachingTools: false,
      teachingPolicyMode: "none",
      supportsInlineFigures: false,
      includeLearningCompanionBehavior: false,
      recommendedTeacherName: "code-teacher",
    }
  }

  return {
    role: "companion",
    interactiveWorkspace: false,
    teachingTools: false,
    teachingPolicyMode: "none",
    supportsInlineFigures: false,
    includeLearningCompanionBehavior: input.key !== "goal-writer",
    recommendedTeacherName: "code-teacher",
  }
}

function registerBuddyAgent(input: BuddyAgentRegistration): RegisteredBuddyAgent {
  if (registeredBuddyAgents.has(input.key)) {
    throw new Error(`Buddy agent "${input.key}" is already registered`)
  }

  const agent = Config.Agent.parse(input.agent)
  registeredBuddyAgents.set(input.key, agent)
  const meta = input.meta ?? defaultBuddyAgentMeta({ key: input.key })
  registeredBuddyAgentMeta.set(input.key, meta)

  return {
    key: input.key,
    agent,
    meta,
  }
}

function listBuddyAgents(): readonly RegisteredBuddyAgent[] {
  return [...registeredBuddyAgents.entries()].map(([key, agent]) => ({
    key,
    agent,
    meta: registeredBuddyAgentMeta.get(key) ?? defaultBuddyAgentMeta({ key }),
  }))
}

function indexBuddyAgents(): Record<string, Config.Agent> {
  return Object.fromEntries(registeredBuddyAgents)
}

function getBuddyAgentMeta(key: string | undefined): BuddyAgentMeta {
  if (!key) {
    return defaultBuddyAgentMeta()
  }

  return registeredBuddyAgentMeta.get(key) ?? defaultBuddyAgentMeta({ key })
}

export {
  getBuddyAgentMeta,
  indexBuddyAgents,
  listBuddyAgents,
  registerBuddyAgent,
}

export type {
  BuddyAgentRegistration,
  RegisteredBuddyAgent,
}
