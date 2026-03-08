import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { Session } from "@buddy/opencode-adapter/session"
import { readProjectConfig } from "../../config/compatibility.js"
import { compileRuntimeProfile } from "../../learning/runtime/compiler.js"
import { readTeachingSessionState } from "../../learning/runtime/session-state.js"
import type { RuntimeProfile, TeachingIntentId } from "../../learning/runtime/types.js"
import { buildBuddyRuntimeSessionPermissions } from "../../learning/runtime/session-permissions.js"
import { getBuddyPersona } from "../../personas/catalog.js"
import type { BuddyPersonaId } from "../../personas/types.js"
import { loadOpenCodeApp } from "../../opencode-runtime/runtime.js"
import { isSessionNotFoundError } from "./lookup.js"

function sortPermissionRules(rules: PermissionRuleset | undefined) {
  return [...(rules ?? [])].sort((left, right) => {
    const leftKey = `${left.permission}:${left.pattern}:${left.action}`
    const rightKey = `${right.permission}:${right.pattern}:${right.action}`
    return leftKey.localeCompare(rightKey)
  })
}

function permissionRulesEqual(left: PermissionRuleset | undefined, right: PermissionRuleset): boolean {
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
  runtimeProfile?: RuntimeProfile
}) {
  await loadOpenCodeApp()
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const session = await Session.get(input.sessionID).catch((error) => {
        if (isSessionNotFoundError(error)) {
          return undefined
        }
        throw error
      })
      if (!session) {
        return
      }
      const nextPermission = buildBuddyRuntimeSessionPermissions({
        existing: session.permission,
        runtimeProfile: input.runtimeProfile,
      })

      if (permissionRulesEqual(session.permission, nextPermission)) {
        return
      }

      await Session.setPermission({
        sessionID: input.sessionID,
        permission: nextPermission,
      })
    },
  })
}

export async function compileCommandRuntimeProfile(input: {
  directory: string
  sessionID: string
  config: Awaited<ReturnType<typeof readProjectConfig>>
  personaID: BuddyPersonaId
  intentOverride?: TeachingIntentId
}): Promise<RuntimeProfile> {
  const persona = getBuddyPersona(input.personaID, input.config.personas)
  const previousState = readTeachingSessionState(input.directory, input.sessionID)
  return compileRuntimeProfile({
    persona,
    workspaceState: previousState?.workspaceState ?? "chat",
    intentOverride: input.intentOverride,
  })
}
