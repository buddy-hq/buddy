import { constrainPermissionGrants, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { readSessionPermissions, updateSessionPermissions } from "@buddy/opencode-adapter/gateway/permission"
import { readAuthoredPermissionRules } from "./authored-permissions"
import type { ResolvedSessionRuntime } from "../../access/types"
import { buildBuddyRuntimeSessionPermissions } from "./session-permissions"
import { withDynamicLearningToolAllows, exactDynamicAllowRules } from "../../runtime/dynamic-tool-grants"
import { publishBuddyDelegationSource, readBuddyTeachingSnapshot, withBuddyTeachingSessionUpdate } from "../state/teaching-session-metadata"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { awaitNotebookRuntime } from "../../../config/runtime/notebook-config-plugin"

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
  client?: Pick<OpenCodeHost, "session" | "sessions" | "agent" | "rpc">
}) {
  const { getOpenCodeClient } = await import("../../../opencode-runtime/client")
  const client = input.client ?? await getOpenCodeClient()
  await withBuddyTeachingSessionUpdate(input.sessionID, async () => {
    const session = await readSessionPermissions(client, input.sessionID)
    if (session === undefined) return
    const current = await client.session.get({ sessionID: input.sessionID })
    const snapshot = readBuddyTeachingSnapshot(current.metadata)
    if (snapshot?.ownerSessionID === current.id && snapshot.roleID !== undefined) return
    const configured = await readAuthoredPermissionRules(input.directory, session.agent ?? input.sessionRuntime?.persona)
    await updateSessionPermissions(client, input.sessionID, (existing, hasParentSession) => {
      const toolIDs = exactDynamicAllowRules(existing).map((rule) => rule.permission)
      const next = withDynamicLearningToolAllows({
        existing: nextManagedPermission({ existing, hasParentSession, sessionRuntime: input.sessionRuntime, configured }),
        toolIDs,
      })
      return constrainPermissionGrants(next, configured, toolIDs, process.platform === "win32" ? "win32" : "posix")
    })
    if (current.parentID) return
    await awaitNotebookRuntime(client, input.directory)
    await publishBuddyDelegationSource({ ctx: { session: client.session, agent: client.agent, location: { directory: input.directory } }, sessionID: input.sessionID })
  })
}
