import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionID } from "@buddy/opencode-adapter/id"
import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { Session } from "@buddy/opencode-adapter/session"
import type { BuddyTool } from "./create-buddy-tool"
import {
  allDynamicLearningToolCatalogEntries,
  isDynamicLearningToolID,
} from "./dynamic-tool-catalog"
import {
  dynamicLearningToolDefaultDenyRules,
  isExactDynamicLearningToolAllowRule,
  removeDynamicLearningToolSessionRules,
} from "./dynamic-tool-permissions"
import { registerBuddyTools, unregisterBuddyTools } from "../runtime/register-buddy-tools"
import { isSessionNotFoundError } from "../../session"

type DynamicGrantKey = string
type DynamicSessionSearchCandidates = {
  toolIDs: Set<string>
}

const ANY_PATTERN = "*" as const
const ALLOW_ACTION = "allow" as const
const searchCandidatesBySession = new Map<DynamicGrantKey, DynamicSessionSearchCandidates>()

function grantKey(directory: string, sessionID: string): DynamicGrantKey {
  return `${directory}\0${sessionID}`
}

function exactAllowRule(toolID: string): PermissionRule {
  return {
    permission: toolID,
    pattern: ANY_PATTERN,
    action: ALLOW_ACTION,
  }
}

function exactDynamicAllowToolIDs(permission: PermissionRuleset | undefined): string[] {
  return exactDynamicAllowRules(permission).map((rule) => rule.permission)
}

function withDynamicLearningToolAllows(input: {
  existing: PermissionRuleset | undefined
  toolIDs: readonly string[]
}): PermissionRuleset {
  const exactAllowRules = exactDynamicAllowRules(input.existing)
  const grantedToolIDs = new Set([
    ...exactAllowRules.map((rule) => rule.permission),
    ...input.toolIDs,
  ])
  const withoutDynamicAllowRules = (input.existing ?? []).filter(
    (rule) => !isExactDynamicLearningToolAllowRule(rule),
  )

  return [...withoutDynamicAllowRules, ...Array.from(grantedToolIDs).map(exactAllowRule)]
}

async function withSessionInfo<Result>(input: {
  directory: string
  sessionID: string
  handle: (session: Session.Info) => Promise<Result>
}): Promise<Result | undefined> {
  const sessionID = SessionID.make(input.sessionID)
  return OpenCodeInstance.provide({
    directory: input.directory,
    async fn() {
      const session = await Session.get(sessionID).catch((error) => {
        if (isSessionNotFoundError(error)) return undefined
        throw error
      })
      if (!session) return undefined
      return input.handle(session)
    },
  })
}

async function updateSessionPermission(input: {
  directory: string
  sessionID: string
  update: (permission: PermissionRuleset | undefined) => PermissionRuleset
}): Promise<boolean> {
  const sessionID = SessionID.make(input.sessionID)
  const updated = await withSessionInfo({
    directory: input.directory,
    sessionID: input.sessionID,
    async handle(session) {
      await Session.setPermission({
        sessionID,
        permission: input.update(session.permission),
      })
      return true
    },
  })
  return updated ?? false
}

function recordDynamicLearningToolSearchCandidates(input: {
  directory: string
  sessionID: string
  toolIDs: readonly string[]
}): void {
  const key = grantKey(input.directory, input.sessionID)
  searchCandidatesBySession.set(key, {
    toolIDs: new Set(input.toolIDs),
  })
}

function dynamicLearningToolSearchCandidateIDsForSession(input: {
  directory: string
  sessionID: string
}): Set<string> {
  const key = grantKey(input.directory, input.sessionID)
  return new Set(searchCandidatesBySession.get(key)?.toolIDs ?? [])
}

async function grantedDynamicLearningToolIDsForSession(input: {
  directory: string
  sessionID: string
}): Promise<string[]> {
  return (
    (await withSessionInfo({
      directory: input.directory,
      sessionID: input.sessionID,
      async handle(session) {
        return exactDynamicAllowToolIDs(session.permission)
      },
    })) ?? []
  )
}

function grantedDynamicLearningTools(toolIDs: readonly string[]): BuddyTool[] {
  const requestedIDs = new Set(toolIDs)
  return allDynamicLearningToolCatalogEntries()
    .filter((entry) => requestedIDs.has(entry.id))
    .map((entry) => entry.tool)
}

async function referencedToolIDs(input: {
  directory: string
  excludedSessionID?: string
}): Promise<Set<string>> {
  const referenced = new Set<string>()
  const sessions = await OpenCodeInstance.provide({
    directory: input.directory,
    async fn() {
      return Session.list({ directory: input.directory })
    },
  })
  for (const session of sessions) {
    if (session.id === input.excludedSessionID) continue
    for (const toolID of exactDynamicAllowToolIDs(session.permission)) {
      referenced.add(toolID)
    }
  }
  return referenced
}

async function unregisterUnreferencedDynamicTools(input: {
  directory: string
  previousToolIDs: readonly string[]
  excludedSessionID?: string
}): Promise<void> {
  const referenced = await referencedToolIDs({
    directory: input.directory,
    excludedSessionID: input.excludedSessionID,
  })
  const unreferenced = input.previousToolIDs.filter((toolID) => !referenced.has(toolID))
  if (unreferenced.length === 0) return

  await unregisterBuddyTools(input.directory, unreferenced)
}

type ReleaseDynamicLearningToolsForSessionInput = {
  directory: string
  sessionID: string
  resetPermission: boolean
}

async function releaseDynamicLearningToolsForSession(
  input: ReleaseDynamicLearningToolsForSessionInput,
): Promise<void> {
  const previousToolIDs = allDynamicLearningToolCatalogEntries().map((entry) => entry.id)
  searchCandidatesBySession.delete(grantKey(input.directory, input.sessionID))

  if (input.resetPermission) {
    await updateSessionPermission({
      directory: input.directory,
      sessionID: input.sessionID,
      update(permission) {
        return [
          ...removeDynamicLearningToolSessionRules(permission),
          ...dynamicLearningToolDefaultDenyRules(),
        ]
      },
    })
  }

  await unregisterUnreferencedDynamicTools({
    directory: input.directory,
    previousToolIDs,
    excludedSessionID: input.sessionID,
  })
}

async function grantDynamicLearningToolsForSession(input: {
  directory: string
  sessionID: string
  tools: readonly BuddyTool[]
}): Promise<string[]> {
  const dynamicTools = input.tools.filter((tool) => isDynamicLearningToolID(tool.id))
  if (dynamicTools.length === 0) return []

  const toolIDs = dynamicTools.map((tool) => tool.id)

  const granted = await updateSessionPermission({
    directory: input.directory,
    sessionID: input.sessionID,
    update(permission) {
      return withDynamicLearningToolAllows({
        existing: permission,
        toolIDs,
      })
    },
  })
  if (!granted) return []

  await registerBuddyTools(input.directory, dynamicTools)

  return toolIDs
}

async function clearDynamicLearningToolGrantsForSession(input: {
  directory: string
  sessionID: string
}): Promise<void> {
  await releaseDynamicLearningToolsForSession({
    directory: input.directory,
    sessionID: input.sessionID,
    resetPermission: true,
  })
}

async function clearDynamicLearningToolsForEndedSession(input: {
  directory: string
  sessionID: string
}): Promise<void> {
  await releaseDynamicLearningToolsForSession({
    directory: input.directory,
    sessionID: input.sessionID,
    resetPermission: true,
  })
}

function exactDynamicAllowRules(rules: PermissionRuleset | undefined): PermissionRuleset {
  return (rules ?? []).filter(isExactDynamicLearningToolAllowRule)
}

async function ensureDynamicLearningToolsRegisteredForSession(input: {
  directory: string
  sessionID: string
}): Promise<string[]> {
  const toolIDs = await grantedDynamicLearningToolIDsForSession(input)
  if (toolIDs.length === 0) return []

  const tools = grantedDynamicLearningTools(toolIDs)
  if (tools.length === 0) return []

  await registerBuddyTools(input.directory, tools)
  return tools.map((tool) => tool.id)
}

export {
  clearDynamicLearningToolsForEndedSession,
  clearDynamicLearningToolGrantsForSession,
  dynamicLearningToolSearchCandidateIDsForSession,
  ensureDynamicLearningToolsRegisteredForSession,
  exactDynamicAllowRules,
  grantedDynamicLearningToolIDsForSession,
  grantDynamicLearningToolsForSession,
  recordDynamicLearningToolSearchCandidates,
  withDynamicLearningToolAllows,
}
