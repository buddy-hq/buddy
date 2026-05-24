import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext, type PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import type { Config } from "@buddy/backend/config"
import type { readProjectConfig } from "@buddy/backend/config/runtime"
import type { BuddyPermissionInput } from "../../agent-factories"
import { resolveSessionRuntime } from "../../access/resolve-session-runtime"
import { buildBuddyRuntimeSessionPermissions } from "../permissions/session-permissions"
import { readTeachingSessionState } from "../state/session-state"
import { getBuddyPersona, getDefaultBuddyPersona } from "../../personas/wiring/persona-profiles"
import { REGISTERED_BUDDY_PERSONAS } from "../../personas/registry"
import { resolveCurrentSurface } from "../../shared/targeting"
import type { TeachingSessionState } from "../../shared/teaching-session-state"
import {
  isPersonaDelegateId,
  type Persona,
  type TeachingWorkspaceState,
} from "../../shared/teaching-vocabulary"
import { getLearningToolMetadata } from "../../runtime/tool-metadata"
import { toolMatchesRuntimeConstraints } from "../../runtime/tool-constraints"
import { getBuddySubagentDefinition } from "../../subagent-manifest"
import { isDynamicLearningToolSessionRule } from "../../runtime/dynamic-tool-permissions"

const EDIT_PERMISSION_TOOL_IDS = new Set(["apply_patch", "edit", "multiedit", "write"])

type ToolOverrideMap = Record<string, boolean>
type MessageProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type SubagentPolicyContext = {
  personaID: Persona
  focusGoalIds: string[]
  hasParentSession: boolean
  policy: true | { denyTools?: readonly string[] }
  currentSessionPermission?: PermissionRuleset
  teachingWorkspaceState: TeachingWorkspaceState
  parentSessionPermission?: PermissionRuleset
  parentUserTools?: ToolOverrideMap
}

type SubagentForwardingResult = {
  stateSeed?: Pick<
    TeachingSessionState,
    "currentSurface" | "focusGoalIds" | "persona" | "sessionId" | "teachingWorkspaceState"
  >
  sessionPermission?: PermissionRuleset
  toolOverrides?: ToolOverrideMap
}

type ToolModelInput = Parameters<typeof ToolRegistry.tools>[0]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isSessionNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }
  const payload = error as {
    name?: unknown
    message?: unknown
    data?: { message?: unknown }
  }
  if (payload.name !== "NotFoundError") {
    return false
  }
  const message =
    typeof payload.data?.message === "string"
      ? payload.data.message
      : typeof payload.message === "string"
        ? payload.message
        : undefined
  return typeof message === "string" && message.startsWith("Session not found:")
}

function toolPermissionKey(toolID: string): string {
  return EDIT_PERMISSION_TOOL_IDS.has(toolID) ? "edit" : toolID
}

function parseToolOverrides(value: unknown): ToolOverrideMap | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
  )
  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

function clonePermissionRules(
  permission: PermissionRuleset | undefined,
): PermissionRuleset | undefined {
  return permission?.map((rule) => ({ ...rule }))
}

function hasExplicitStandaloneSessionPermission(
  permission: PermissionRuleset | undefined,
): boolean {
  return (permission ?? []).some((rule) => !isDynamicLearningToolSessionRule(rule))
}

function visibleToolIDs(input: {
  agentPermission: PermissionRuleset | undefined
  allToolIDs: readonly string[]
  sessionPermission?: PermissionRuleset
  toolOverrides?: ToolOverrideMap
}): Set<string> {
  const disabled = PermissionNext.disabled(
    [...input.allToolIDs],
    PermissionNext.merge(input.agentPermission ?? [], input.sessionPermission ?? []),
  )

  return new Set(
    input.allToolIDs.filter(
      (toolID) => input.toolOverrides?.[toolID] !== false && !disabled.has(toolID),
    ),
  )
}

function collectPermissionKeys(
  permission: BuddyPermissionInput | undefined,
  action: "allow" | "deny",
): Set<string> {
  if (!permission || typeof permission === "string") {
    return new Set()
  }

  const keys = new Set<string>()
  for (const [permissionKey, rule] of Object.entries(permission)) {
    if (permissionKey === "*") {
      continue
    }

    if (typeof rule === "string") {
      if (rule === action) {
        keys.add(permissionKey)
      }
      continue
    }

    if (Object.values(rule).some((value) => value === action)) {
      keys.add(permissionKey)
    }
  }

  return keys
}

function toolIDsForPermissionKey(input: {
  allToolIDs: readonly string[]
  permissionKey: string
  toolIDsByPermission: Map<string, string[]>
}): string[] {
  const exactMatches = input.allToolIDs.filter((toolID) => toolID === input.permissionKey)
  const groupMatches = input.toolIDsByPermission.get(input.permissionKey) ?? []
  return [...new Set([...exactMatches, ...groupMatches])]
}

function currentRuntimeAllowsTool(input: {
  configuredToolToggles: Config.Info["tools"] | undefined
  teachingWorkspaceState: TeachingWorkspaceState
  toolID: string
}): boolean {
  if (input.configuredToolToggles?.[input.toolID] === false) {
    return false
  }

  const metadata = getLearningToolMetadata(input.toolID)
  if (!metadata) {
    return true
  }

  if (!toolMatchesRuntimeConstraints(metadata)) {
    return false
  }

  if (metadata.constraints?.teachingWorkspace === "active") {
    return input.teachingWorkspaceState === "active"
  }

  return true
}

function specializedToolIDs(input: {
  allToolIDs: readonly string[]
  configuredToolToggles: Config.Info["tools"] | undefined
  targetAgent: string
  teachingWorkspaceState: TeachingWorkspaceState
}): Set<string> {
  const definition = getBuddySubagentDefinition(input.targetAgent)
  if (!definition) {
    return new Set()
  }

  const toolIDsByPermission = new Map<string, string[]>()
  for (const toolID of input.allToolIDs) {
    const permission = toolPermissionKey(toolID)
    const existing = toolIDsByPermission.get(permission)
    if (existing) {
      existing.push(toolID)
      continue
    }
    toolIDsByPermission.set(permission, [toolID])
  }

  const visible = new Set<string>((definition.tools ?? []).map((tool) => tool.id))
  const explicitAllowKeys = collectPermissionKeys(definition.permission, "allow")
  const explicitDenyKeys = collectPermissionKeys(definition.permission, "deny")

  for (const permissionKey of explicitAllowKeys) {
    for (const toolID of toolIDsForPermissionKey({
      allToolIDs: input.allToolIDs,
      permissionKey,
      toolIDsByPermission,
    })) {
      visible.add(toolID)
    }
  }

  for (const permissionKey of explicitDenyKeys) {
    for (const toolID of toolIDsForPermissionKey({
      allToolIDs: input.allToolIDs,
      permissionKey,
      toolIDsByPermission,
    })) {
      visible.delete(toolID)
    }
  }

  return new Set(
    [...visible].filter((toolID) =>
      currentRuntimeAllowsTool({
        configuredToolToggles: input.configuredToolToggles,
        teachingWorkspaceState: input.teachingWorkspaceState,
        toolID,
      }),
    ),
  )
}

function buildToolOverrides(input: {
  allowedToolIDs: Set<string>
  allToolIDs: readonly string[]
  existing: unknown
  specializedToolIDs: Set<string>
}): ToolOverrideMap {
  const existing = parseToolOverrides(input.existing) ?? {}
  const forwarded: ToolOverrideMap = {}

  for (const toolID of input.allToolIDs) {
    const forceAllow = input.specializedToolIDs.has(toolID)
    forwarded[toolID] =
      input.allowedToolIDs.has(toolID) && (forceAllow || existing[toolID] !== false)
  }

  for (const [toolID, enabled] of Object.entries(existing)) {
    if (toolID in forwarded) {
      continue
    }
    forwarded[toolID] = enabled
  }

  return forwarded
}

async function readLatestUserPromptContext(input: { directory: string; sessionID: string }) {
  const messages = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () =>
      OpenCodeSession.messages({
        sessionID: SessionID.make(input.sessionID),
      }),
  })
  const message = messages.findLast((entry) => entry.info.role === "user")
  if (!message || message.info.role !== "user") {
    return undefined
  }

  return {
    tools: parseToolOverrides(message.info.tools),
  }
}

async function resolveSubagentPolicyContext(input: {
  directory: string
  previousState?: TeachingSessionState
  projectConfig: MessageProjectConfig
  sessionID: string
  targetAgent: string
}): Promise<SubagentPolicyContext | undefined> {
  const session = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () => OpenCodeSession.get(SessionID.make(input.sessionID)),
  }).catch((error) => {
    if (isSessionNotFoundError(error)) {
      return undefined
    }
    throw error
  })
  if (!session) {
    return undefined
  }
  const parentSessionID = session.parentID
  const parentSession = parentSessionID
    ? await OpenCodeInstance.provide({
        directory: input.directory,
        fn: () => OpenCodeSession.get(SessionID.make(parentSessionID)),
      }).catch((error) => {
        if (isSessionNotFoundError(error)) {
          return undefined
        }
        throw error
      })
    : undefined
  const parentState = parentSession
    ? readTeachingSessionState(input.directory, parentSession.id)
    : undefined
  const parentUserPrompt = parentSession
    ? await readLatestUserPromptContext({
        directory: input.directory,
        sessionID: parentSession.id,
      })
    : undefined

  const personaID =
    input.previousState?.persona ??
    parentState?.persona ??
    getDefaultBuddyPersona({
      defaultPersona: input.projectConfig.default_persona,
      overrides: input.projectConfig.personas,
    }).id
  const teachingWorkspaceState =
    input.previousState?.teachingWorkspaceState ?? parentState?.teachingWorkspaceState ?? "inactive"
  const focusGoalIds = input.previousState?.focusGoalIds ?? parentState?.focusGoalIds ?? []

  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
    (definition) => definition.id === personaID,
  )
  if (!personaDefinition) {
    throw new Error(`Unknown Buddy persona "${personaID}"`)
  }

  const policy =
    isPersonaDelegateId(input.targetAgent) && personaDefinition.runtime.subagents
      ? personaDefinition.runtime.subagents[input.targetAgent]
      : undefined
  if (!policy) {
    return undefined
  }

  return {
    personaID,
    focusGoalIds,
    hasParentSession: !!parentSessionID,
    policy,
    teachingWorkspaceState,
    ...(session.permission ? { currentSessionPermission: session.permission } : {}),
    ...(parentSession?.permission ? { parentSessionPermission: parentSession.permission } : {}),
    ...(parentUserPrompt?.tools ? { parentUserTools: parentUserPrompt.tools } : {}),
  }
}

async function resolvePersonaVisibility(input: {
  allToolIDs: readonly string[]
  directory: string
  personaID: Persona
  projectConfig: MessageProjectConfig
  teachingWorkspaceState: TeachingWorkspaceState
}): Promise<{ sessionPermission: PermissionRuleset; visibleToolIDs: Set<string> }> {
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
    (definition) => definition.id === input.personaID,
  )
  if (!personaDefinition) {
    throw new Error(`Unknown Buddy persona "${input.personaID}"`)
  }

  const persona = getBuddyPersona(input.personaID, input.projectConfig.personas)
  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: personaDefinition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState: input.teachingWorkspaceState,
    configuredToolToggles: input.projectConfig.tools,
  })
  const personaAgent = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () => OpenCodeAgent.get(input.personaID),
  })
  if (!personaAgent) {
    throw new Error(`Unknown Buddy agent "${input.personaID}"`)
  }

  const sessionPermission = buildBuddyRuntimeSessionPermissions({
    sessionRuntime,
  })

  return {
    sessionPermission,
    visibleToolIDs: visibleToolIDs({
      agentPermission: personaAgent.permission,
      allToolIDs: input.allToolIDs,
      sessionPermission,
    }),
  }
}

function forwardedPermissionKeys(allToolIDs: readonly string[]): Set<string> {
  return new Set(allToolIDs.map((toolID) => toolPermissionKey(toolID)))
}

function forwardedToolPermissionRules(input: {
  allowedToolIDs: Set<string>
  allToolIDs: readonly string[]
}): PermissionRuleset {
  const toolIDsByPermission = new Map<string, string[]>()

  for (const toolID of input.allToolIDs) {
    const permissionKey = toolPermissionKey(toolID)
    const existing = toolIDsByPermission.get(permissionKey)
    if (existing) {
      existing.push(toolID)
      continue
    }
    toolIDsByPermission.set(permissionKey, [toolID])
  }

  const rules: PermissionRuleset = []
  for (const [permissionKey, toolIDs] of toolIDsByPermission.entries()) {
    if (permissionKey === "task" || permissionKey === "skill") {
      continue
    }

    rules.push({
      permission: permissionKey,
      pattern: "*",
      action: toolIDs.some((toolID) => input.allowedToolIDs.has(toolID)) ? "allow" : "deny",
    })
  }

  return rules
}

function forwardedPatternPermissionRules(input: {
  allowedToolIDs: Set<string>
  basePermission?: PermissionRuleset
}): PermissionRuleset {
  const rules: PermissionRuleset = []
  const basePermission = clonePermissionRules(input.basePermission) ?? []

  if (input.allowedToolIDs.has("task")) {
    rules.push(...basePermission.filter((rule) => rule.permission === "task"))
  } else {
    rules.push({
      permission: "task",
      pattern: "*",
      action: "deny",
    })
  }

  if (input.allowedToolIDs.has("skill")) {
    rules.push(...basePermission.filter((rule) => rule.permission === "skill"))
  } else {
    rules.push({
      permission: "skill",
      pattern: "*",
      action: "deny",
    })
  }

  return rules
}

function buildForwardedSessionPermission(input: {
  allowedToolIDs: Set<string>
  allToolIDs: readonly string[]
  basePermission?: PermissionRuleset
  existingPermission?: PermissionRuleset
}): PermissionRuleset {
  const managedPermissionKeys = forwardedPermissionKeys(input.allToolIDs)
  const preservedRules = (clonePermissionRules(input.existingPermission) ?? []).filter(
    (rule) => !managedPermissionKeys.has(rule.permission),
  )

  return [
    ...preservedRules,
    ...forwardedToolPermissionRules({
      allowedToolIDs: input.allowedToolIDs,
      allToolIDs: input.allToolIDs,
    }),
    ...forwardedPatternPermissionRules({
      allowedToolIDs: input.allowedToolIDs,
      basePermission: input.basePermission,
    }),
  ]
}

function stateSeed(input: {
  focusGoalIds: string[]
  personaID: Persona
  projectConfig: MessageProjectConfig
  sessionID: string
  teachingWorkspaceState: TeachingWorkspaceState
}): Pick<
  TeachingSessionState,
  "currentSurface" | "focusGoalIds" | "persona" | "sessionId" | "teachingWorkspaceState"
> {
  return {
    sessionId: input.sessionID,
    persona: input.personaID,
    currentSurface: resolveCurrentSurface({
      personaID: input.personaID,
      config: input.projectConfig,
      teachingWorkspaceState: input.teachingWorkspaceState,
    }),
    teachingWorkspaceState: input.teachingWorkspaceState,
    focusGoalIds: [...input.focusGoalIds],
  }
}

export async function resolveSubagentToolForwarding(input: {
  currentTools: unknown
  directory: string
  model?: ToolModelInput
  previousState?: TeachingSessionState
  projectConfig: MessageProjectConfig
  sessionID: string
  targetAgent: string
}): Promise<SubagentForwardingResult> {
  const context = await resolveSubagentPolicyContext(input)
  if (!context) {
    return {}
  }

  const explicitCurrentTools = parseToolOverrides(input.currentTools)
  const targetIsPersonaDelegate = isPersonaDelegateId(input.targetAgent)
  if (
    !targetIsPersonaDelegate &&
    !input.previousState &&
    !context.hasParentSession &&
    (explicitCurrentTools ||
      hasExplicitStandaloneSessionPermission(context.currentSessionPermission))
  ) {
    return {}
  }

  const registryToolIDs = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: () => ToolRegistry.ids(),
  })
  const model = input.model
  const modelToolIDs = model
    ? await OpenCodeInstance.provide({
        directory: input.directory,
        fn: async () => (await ToolRegistry.tools(model, input.targetAgent)).map((tool) => tool.id),
      })
    : []
  const allToolIDs = [...new Set([...registryToolIDs, ...modelToolIDs])]
  const personaVisibility = await resolvePersonaVisibility({
    allToolIDs,
    directory: input.directory,
    personaID: context.personaID,
    projectConfig: input.projectConfig,
    teachingWorkspaceState: context.teachingWorkspaceState,
  })
  const inheritedToolIDs = visibleToolIDs({
    agentPermission: (
      await OpenCodeInstance.provide({
        directory: input.directory,
        fn: () => OpenCodeAgent.get(context.personaID),
      })
    )?.permission,
    allToolIDs,
    sessionPermission: context.parentSessionPermission ?? personaVisibility.sessionPermission,
    toolOverrides: context.parentUserTools,
  })
  const baseSessionPermission =
    clonePermissionRules(context.parentSessionPermission) ?? personaVisibility.sessionPermission

  const specialized = specializedToolIDs({
    allToolIDs,
    configuredToolToggles: input.projectConfig.tools,
    targetAgent: input.targetAgent,
    teachingWorkspaceState: context.teachingWorkspaceState,
  })
  const allowedToolIDs = new Set<string>([...inheritedToolIDs, ...specialized])

  if (context.policy !== true) {
    for (const toolID of context.policy.denyTools ?? []) {
      allowedToolIDs.delete(toolID)
    }
  }

  return {
    sessionPermission: buildForwardedSessionPermission({
      allowedToolIDs,
      allToolIDs,
      basePermission: baseSessionPermission,
      existingPermission: context.currentSessionPermission,
    }),
    toolOverrides: buildToolOverrides({
      allowedToolIDs,
      allToolIDs,
      existing: input.currentTools,
      specializedToolIDs: specialized,
    }),
    ...(!input.previousState
      ? {
          stateSeed: stateSeed({
            focusGoalIds: context.focusGoalIds,
            personaID: context.personaID,
            projectConfig: input.projectConfig,
            sessionID: input.sessionID,
            teachingWorkspaceState: context.teachingWorkspaceState,
          }),
        }
      : {}),
  }
}
