import "./opencode-environment"
import { Permission } from "@buddy/opencode-adapter/permission"
import { readProjectConfig } from "../config/runtime/config-access"
import { readTeachingSessionState } from "../learning/agent-execution/state/session-state"
import { buildBuddyRuntimeSessionPermissions } from "../learning/agent-execution/permissions/session-permissions"
import { directoryKey } from "./directory-key"
import type { BuddyPermissionResolution } from "./ui-requests"
import { requestBuddyPiPermission } from "./ui-requests"

type PermissionAction = "allow" | "deny" | "ask"

type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

type PermissionRequestInput = {
  directory: string
  sessionID: string
  messageID: string
  toolCallID: string
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
  signal: AbortSignal
}

const approvedRulesByDirectory = new Map<string, PermissionRule[]>()

function approvedRules(directory: string) {
  const key = directoryKey(directory)
  const existing = approvedRulesByDirectory.get(key)
  if (existing) return existing
  const created: PermissionRule[] = []
  approvedRulesByDirectory.set(key, created)
  return created
}

async function buddyPermissionRuleset(input: {
  directory: string
  sessionID: string
}): Promise<PermissionRule[]> {
  const config = await readProjectConfig(input.directory)
  const existing = Permission.fromConfig(config.permission ?? {})
  const sessionRuntime = readTeachingSessionState(input.directory, input.sessionID)?.sessionRuntime
  return buildBuddyRuntimeSessionPermissions({
    existing,
    sessionRuntime,
  })
}

function applyAlwaysApproval(input: {
  directory: string
  resolution: BuddyPermissionResolution
  permission: string
  always: string[]
}) {
  if (input.resolution.reply !== "always") {
    return
  }

  const approvals = approvedRules(input.directory)
  for (const pattern of input.always) {
    approvals.push({
      permission: input.permission,
      pattern,
      action: "allow",
    })
  }
}

export async function requestBuddyToolPermission(input: PermissionRequestInput) {
  const ruleset = await buddyPermissionRuleset({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  const approved = approvedRules(input.directory)
  let needsPrompt = false

  for (const pattern of input.patterns) {
    const rule = Permission.evaluate(input.permission, pattern, ruleset, approved)
    if (rule.action === "deny") {
      throw new Permission.DeniedError({
        ruleset: ruleset.filter(
          (entry) => entry.permission === input.permission || entry.permission === "*",
        ),
      })
    }
    if (rule.action === "allow") {
      continue
    }
    needsPrompt = true
  }

  if (!needsPrompt) {
    return
  }

  const resolution = await requestBuddyPiPermission({
    directory: input.directory,
    sessionID: input.sessionID,
    permission: input.permission,
    patterns: input.patterns,
    always: input.always,
    metadata: input.metadata,
    tool: {
      messageID: input.messageID,
      callID: input.toolCallID,
    },
    options: {
      signal: input.signal,
    },
  })

  if (resolution.reply === "reject") {
    if (resolution.message?.trim()) {
      throw new Permission.CorrectedError({
        feedback: resolution.message.trim(),
      })
    }
    throw new Permission.RejectedError()
  }

  applyAlwaysApproval({
    directory: input.directory,
    resolution,
    permission: input.permission,
    always: input.always,
  })
}
