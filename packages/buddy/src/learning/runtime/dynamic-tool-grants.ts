import type { BuddyTool } from "./create-buddy-tool"
import { readProjectConfig } from "../../config/runtime/config-access"
import {
  allDynamicLearningToolCatalogEntries,
  isDynamicLearningToolID,
} from "./dynamic-tool-catalog"
import { resolveSessionRuntime } from "../access/resolve-session-runtime"
import {
  isExactDynamicLearningToolAllowRule,
  type PermissionRule,
  type PermissionRuleset,
} from "./dynamic-tool-permissions"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../agent-execution/state/session-state"
import { syncBuddyRuntimeSessionPermissions } from "../agent-execution/permissions/runtime-session-permissions"
import { REGISTERED_BUDDY_PERSONAS } from "../personas/registry"
import { getBuddyPersona, getDefaultBuddyPersona } from "../personas/wiring/persona-profiles"

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

function exactDynamicAllowToolIDsFromSessionRuntime(input: {
  directory: string
  sessionID: string
}): string[] {
  const sessionRuntime = readTeachingSessionState(input.directory, input.sessionID)?.sessionRuntime
  if (!sessionRuntime) {
    return []
  }

  return allDynamicLearningToolCatalogEntries()
    .map((entry) => entry.id)
    .filter((toolID) => sessionRuntime.access.tools[toolID] === "allow")
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
  return exactDynamicAllowToolIDsFromSessionRuntime(input)
}

function grantedDynamicLearningTools(toolIDs: readonly string[]): BuddyTool[] {
  const requestedIDs = new Set(toolIDs)
  return allDynamicLearningToolCatalogEntries()
    .filter((entry) => requestedIDs.has(entry.id))
    .map((entry) => entry.tool)
}

async function ensureTeachingSessionRuntimeState(input: {
  directory: string
  sessionID: string
}) {
  const existingState = readTeachingSessionState(input.directory, input.sessionID)
  if (existingState?.sessionRuntime) {
    return existingState
  }

  const projectConfig = await readProjectConfig(input.directory)
  const personaID =
    existingState?.persona ??
    getDefaultBuddyPersona({
      defaultPersona: projectConfig.default_persona,
      overrides: projectConfig.personas,
    }).id
  const persona = getBuddyPersona(personaID, projectConfig.personas)
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find((definition) => definition.id === persona.id)
  if (!personaDefinition) {
    throw new Error(`Unknown Buddy persona "${persona.id}"`)
  }

  const teachingWorkspaceState = existingState?.teachingWorkspaceState ?? "inactive"
  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: personaDefinition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState,
    configuredToolToggles: projectConfig.tools,
  })
  const nextState = {
    ...existingState,
    sessionId: input.sessionID,
    persona: persona.id,
    currentSurface: existingState?.currentSurface ?? persona.defaultSurface,
    teachingWorkspaceState,
    sessionRuntime,
    focusGoalIds: existingState?.focusGoalIds ?? [],
  }

  writeTeachingSessionState(input.directory, nextState)
  return nextState
}

async function syncDynamicLearningToolSessionRuntime(input: {
  directory: string
  sessionID: string
  toolIDs: readonly string[]
  reset: boolean
}): Promise<boolean> {
  const existingState = await ensureTeachingSessionRuntimeState({
    directory: input.directory,
    sessionID: input.sessionID,
  })
  if (!existingState.sessionRuntime) {
    return false
  }

  const dynamicToolIDs = new Set(allDynamicLearningToolCatalogEntries().map((entry) => entry.id))
  const nextToolAccess = {
    ...existingState.sessionRuntime.access.tools,
  }

  if (input.reset) {
    for (const toolID of dynamicToolIDs) {
      nextToolAccess[toolID] = "deny"
    }
  }

  for (const toolID of input.toolIDs) {
    if (dynamicToolIDs.has(toolID)) {
      nextToolAccess[toolID] = "allow"
    }
  }

  const nextState = {
    ...existingState,
    sessionRuntime: {
      ...existingState.sessionRuntime,
      access: {
        ...existingState.sessionRuntime.access,
        tools: nextToolAccess,
      },
    },
  }

  writeTeachingSessionState(input.directory, nextState)
  await syncBuddyRuntimeSessionPermissions({
    directory: input.directory,
    sessionID: input.sessionID,
    sessionRuntime: nextState.sessionRuntime,
  })
  return true
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

  await syncDynamicLearningToolSessionRuntime({
    directory: input.directory,
    sessionID: input.sessionID,
    toolIDs: [],
    reset: true,
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
  const piGranted = await syncDynamicLearningToolSessionRuntime({
    directory: input.directory,
    sessionID: input.sessionID,
    toolIDs,
    reset: false,
  })

  if (!piGranted) return []

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

  await syncBuddyRuntimeSessionPermissions({
    directory: input.directory,
    sessionID: input.sessionID,
    sessionRuntime: readTeachingSessionState(input.directory, input.sessionID)?.sessionRuntime,
  })
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
