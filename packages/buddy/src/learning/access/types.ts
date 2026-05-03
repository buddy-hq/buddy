import type { Persona, Surface } from "../shared/teaching-vocabulary"

type TeachingWorkspaceState = "inactive" | "active"

type ResolvedSessionRuntime = {
  persona: Persona
  teachingWorkspaceState: TeachingWorkspaceState
  access: {
    tools: Record<string, "allow" | "deny">
    skills: Record<string, "allow" | "deny">
    subagents: Record<string, "allow" | "deny">
  }
  ui: {
    visibleSurfaces: Surface[]
    defaultSurface: Surface
  }
}

export type { ResolvedSessionRuntime, TeachingWorkspaceState }
