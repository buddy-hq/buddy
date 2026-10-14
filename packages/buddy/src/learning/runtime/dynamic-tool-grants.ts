import { withDynamicToolPermissionGrants, resetDynamicToolPermissionGrants, evaluatePermission, constrainPermissionGrants, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { readSessionPermissions, updateSessionPermissions } from "@buddy/opencode-adapter/gateway/permission"
import { readAuthoredPermissionRules } from "../agent-execution/permissions/authored-permissions"
import type { BuddyTool } from "./create-buddy-tool"
import {
  allDynamicLearningToolCatalogEntries,
  allDynamicLearningToolIds,
  isDynamicLearningToolID,
} from "./dynamic-tool-catalog"
import {
  isExactDynamicLearningToolAllowRule,
} from "./dynamic-tool-permissions"

type DynamicGrantKey = string
type DynamicSessionSearchCandidates = {
  toolIDs: Set<string>
}

const searchCandidatesBySession = new Map<DynamicGrantKey, DynamicSessionSearchCandidates>()

function grantKey(directory: string, sessionID: string): DynamicGrantKey {
  return `${directory}\0${sessionID}`
}

function exactDynamicAllowToolIDs(permission: PermissionRuleset | undefined): string[] {
  return exactDynamicAllowRules(permission).map((rule) => rule.permission)
}

function withDynamicLearningToolAllows(input: {
  existing: PermissionRuleset | undefined
  toolIDs: readonly string[]
}): PermissionRuleset {
  return withDynamicToolPermissionGrants({ existing: input.existing ?? [], toolIDs: input.toolIDs, managedToolIDs: allDynamicLearningToolIds() })
}

async function updateSessionPermission(input: {
  directory: string
  sessionID: string
  update: (permission: PermissionRuleset | undefined) => PermissionRuleset
}): Promise<boolean> {
  const { getOpenCodeClient } = await import("../../opencode-runtime/client")
  const client = await getOpenCodeClient()
  const session = await readSessionPermissions(client, input.sessionID)
  if (session === undefined) return false
  const configured = await readAuthoredPermissionRules(input.directory, session.agent)
  const result = await updateSessionPermissions(client, input.sessionID, (existing) => constrainPermissionGrants(input.update(existing), configured, allDynamicLearningToolIds(), process.platform === "win32" ? "win32" : "posix"))
  return result !== "missing"
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
  const { getOpenCodeClient } = await import("../../opencode-runtime/client")
  const client = await getOpenCodeClient()
  const session = await readSessionPermissions(client, input.sessionID)
  return exactDynamicAllowToolIDs(session?.permissions)
}

function grantedDynamicLearningTools(toolIDs: readonly string[]): BuddyTool[] {
  const requestedIDs = new Set(toolIDs)
  return allDynamicLearningToolCatalogEntries()
    .filter((entry) => requestedIDs.has(entry.id))
    .map((entry) => entry.tool)
}

type ReleaseDynamicLearningToolsForSessionInput = {
  directory: string
  sessionID: string
  resetPermission: boolean
}

async function releaseDynamicLearningToolsForSession(
  input: ReleaseDynamicLearningToolsForSessionInput,
): Promise<void> {
  searchCandidatesBySession.delete(grantKey(input.directory, input.sessionID))

  if (input.resetPermission) {
    await updateSessionPermission({
      directory: input.directory,
      sessionID: input.sessionID,
      update(permission) {
        return resetDynamicToolPermissionGrants(permission ?? [], allDynamicLearningToolIds())
      },
    })
  }
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

function clearDynamicLearningToolsForDeletedSessions(input: {
  directory: string
  sessionIDs: readonly string[]
}): void {
  for (const sessionID of input.sessionIDs) {
    searchCandidatesBySession.delete(grantKey(input.directory, sessionID))
  }
}

function exactDynamicAllowRules(rules: PermissionRuleset | undefined): PermissionRuleset {
  return (rules ?? []).filter((rule) => isExactDynamicLearningToolAllowRule(rule) && evaluatePermission(rule.permission, "*", rules ?? [], process.platform === "win32" ? "win32" : "posix").action === "allow")
}

async function ensureDynamicLearningToolsRegisteredForSession(input: {
  directory: string
  sessionID: string
}): Promise<string[]> {
  const toolIDs = await grantedDynamicLearningToolIDsForSession(input)
  if (toolIDs.length === 0) return []

  const tools = grantedDynamicLearningTools(toolIDs)
  return tools.map((tool) => tool.id)
}

export {
  clearDynamicLearningToolsForDeletedSessions,
  clearDynamicLearningToolsForEndedSession,
  clearDynamicLearningToolGrantsForSession,
  dynamicLearningToolSearchCandidateIDsForSession,
  ensureDynamicLearningToolsRegisteredForSession,
  exactDynamicAllowRules,
  grantedDynamicLearningToolIDsForSession,
  grantDynamicLearningToolsForSession,
  recordDynamicLearningToolSearchCandidates,
  releaseDynamicLearningToolsForSession,
  withDynamicLearningToolAllows,
}
