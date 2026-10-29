import type { SessionAccess } from "@buddy/agent-runtime/extension"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"

export function createRuntimeSessionAccess(
  runtime: AgentRuntime,
  directory: string,
): Pick<SessionAccess, "get" | "patchMetadata" | "agentRules"> {
  return {
    async get(sessionID) {
      const session = await runtime.conversations.get(sessionID)
      const policy = await runtime.approvals.sessionRules(sessionID)
      return {
        id: session.id,
        parentID: session.parentID,
        metadata: session.metadata,
        agent: policy?.agent,
        rules: policy?.rules ?? [],
      }
    },
    async patchMetadata(sessionID, patch) {
      await runtime.conversations.patchMetadata(sessionID, patch)
    },
    agentRules(agentID) {
      return runtime.catalog.agentRules(directory, agentID)
    },
  }
}
