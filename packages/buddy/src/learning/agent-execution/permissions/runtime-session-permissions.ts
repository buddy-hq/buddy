import { constrainPermissionGrants, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { readAuthoredPermissionRules } from "./authored-permissions"
import type { ResolvedSessionRuntime } from "../../access/types"
import { buildBuddyRuntimeSessionPermissions } from "./session-permissions"
import { withDynamicLearningToolAllows, exactDynamicAllowRules } from "../../runtime/dynamic-tool-grants"
import { publishBuddyDelegationSource, readBuddyTeachingSnapshot, withBuddyTeachingSessionUpdate } from "../state/teaching-session-metadata"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { getAgentRuntime } from "../../../runtime/agent-runtime"
import { createRuntimeSessionAccess } from "../../../runtime/session-access"

export function nextManagedPermission(input: {
  existing?: PermissionRuleset
  hasParentSession: boolean
  sessionRuntime?: ResolvedSessionRuntime
  configured?: PermissionRuleset
}): PermissionRuleset {
  return buildBuddyRuntimeSessionPermissions(input)
}

export { buildDelegatedChildSessionPermissions } from "./delegated-permissions"

export async function syncBuddyRuntimeSessionPermissions(input: {
  directory: string
  sessionID: string
  sessionRuntime?: ResolvedSessionRuntime
  runtime?: AgentRuntime
}) {
  const runtime = input.runtime ?? await getAgentRuntime()
  const sessions = createRuntimeSessionAccess(runtime, input.directory)
  await withBuddyTeachingSessionUpdate(input.sessionID, async () => {
    const session = await runtime.approvals.sessionRules(input.sessionID)
    if (session === undefined) return
    const current = await sessions.get(input.sessionID)
    const snapshot = readBuddyTeachingSnapshot(current.metadata)
    if (snapshot?.ownerSessionID === current.id && snapshot.roleID !== undefined) return
    const configured = await readAuthoredPermissionRules(input.directory, session.agent ?? input.sessionRuntime?.persona)
    await runtime.approvals.updateSessionRules(input.sessionID, (existing, hasParentSession) => {
      const toolIDs = exactDynamicAllowRules(existing).map((rule) => rule.permission)
      const next = withDynamicLearningToolAllows({
        existing: nextManagedPermission({ existing, hasParentSession, sessionRuntime: input.sessionRuntime, configured }),
        toolIDs,
      })
      return constrainPermissionGrants(next, configured, toolIDs, process.platform === "win32" ? "win32" : "posix")
    })
    if (current.parentID) return
    await runtime.catalog.awaitNotebookPlan(input.directory)
    await publishBuddyDelegationSource({ sessions, directory: input.directory, sessionID: input.sessionID })
  })
}
