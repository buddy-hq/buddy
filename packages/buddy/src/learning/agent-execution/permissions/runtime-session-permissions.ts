import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { Session } from "@buddy/opencode-adapter/session"
import type { ResolvedSessionRuntime } from "../../access/types"
import { buildBuddyRuntimeSessionPermissions } from "./session-permissions"
import {
  ensureDynamicLearningToolsRegisteredForSession,
  withDynamicLearningToolAllows,
} from "../../runtime/dynamic-tool-grants"
import { loadOpenCodeApp } from "../../../opencode-runtime"
import { isSessionNotFoundError } from "../../../session"

function sortPermissionRules(rules: PermissionRuleset | undefined) {
  return [...(rules ?? [])].toSorted((left, right) => {
    const leftKey = `${left.permission}:${left.pattern}:${left.action}`
    const rightKey = `${right.permission}:${right.pattern}:${right.action}`
    return leftKey.localeCompare(rightKey)
  })
}

function permissionRulesEqual(
  left: PermissionRuleset | undefined,
  right: PermissionRuleset,
): boolean {
  const leftRules = sortPermissionRules(left)
  const rightRules = sortPermissionRules(right)
  if (leftRules.length !== rightRules.length) return false

  for (let index = 0; index < leftRules.length; index += 1) {
    const leftRule = leftRules[index]
    const rightRule = rightRules[index]
    if (
      leftRule.permission !== rightRule.permission ||
      leftRule.pattern !== rightRule.pattern ||
      leftRule.action !== rightRule.action
    ) {
      return false
    }
  }

  return true
}

export async function syncBuddyRuntimeSessionPermissions(input: {
  directory: string
  sessionID: string
  sessionRuntime?: ResolvedSessionRuntime
}) {
  await loadOpenCodeApp()
  const sessionID = SessionID.make(input.sessionID)
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const session = await Session.get(sessionID).catch((error) => {
        if (isSessionNotFoundError(error)) {
          return undefined
        }
        throw error
      })
      if (!session) {
        return
      }
      const syncedPermission = buildBuddyRuntimeSessionPermissions({
        existing: session.permission,
        sessionRuntime: input.sessionRuntime,
      })
      const grantedDynamicToolIDs = await ensureDynamicLearningToolsRegisteredForSession({
        directory: input.directory,
        sessionID: input.sessionID,
      })
      const nextPermission =
        grantedDynamicToolIDs.length > 0
          ? withDynamicLearningToolAllows({
              existing: syncedPermission,
              toolIDs: grantedDynamicToolIDs,
            })
          : syncedPermission

      if (permissionRulesEqual(session.permission, nextPermission)) {
        return
      }

      await Session.setPermission({
        sessionID,
        permission: nextPermission,
      })
    },
  })
}
