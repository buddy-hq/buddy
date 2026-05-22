export const BUDDY_AGENT_RUNTIME_ENV = "BUDDY_AGENT_RUNTIME"
export const AGENT_RUNTIME_PI = "pi"

export type AgentRuntimeMode = typeof AGENT_RUNTIME_PI

export function readAgentRuntimeMode(): AgentRuntimeMode {
  return AGENT_RUNTIME_PI
}

export function isPiRuntimeEnabled() {
  return true
}
