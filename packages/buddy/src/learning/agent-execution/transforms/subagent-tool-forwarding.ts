import type { Config } from "@buddy/backend/config"
import type { readProjectConfig } from "../../../config/runtime/config-access"
import { piRuntime } from "../../../pi-backend/runtime"
import type { BuddyPermissionInput } from "../../agent-factories"
import { resolveSessionRuntime } from "../../access/resolve-session-runtime"
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
import { allBuddyTools } from "../../runtime/feature-registry"
import { dynamicToolSearchTools } from "../../runtime/dynamic-tool-discovery"
import { getLearningToolMetadata } from "../../runtime/tool-metadata"
import { toolMatchesRuntimeConstraints } from "../../runtime/tool-constraints"
import { getBuddySubagentDefinition } from "../../subagent-manifest"
import { DEFAULT_BRIDGED_OPENCODE_TOOL_NAMES } from "../../../pi-backend/opencode-tool-bridge"

const EDIT_PERMISSION_TOOL_IDS = new Set(["apply_patch", "edit", "multiedit", "write"])
const DEFAULT_BRIDGED_OPENCODE_TOOL_ID_SET = new Set(DEFAULT_BRIDGED_OPENCODE_TOOL_NAMES)

type ToolOverrideMap = Record<string, boolean>
type MessageProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type SubagentPolicyContext = {
  personaID: Persona
  focusGoalIds: string[]
  hasParentSession: boolean
  policy: true | { denyTools?: readonly string[] }
  parentSessionRuntime?: TeachingSessionState["sessionRuntime"]
  teachingWorkspaceState: TeachingWorkspaceState
  parentUserAgent?: string
  parentUserTools?: ToolOverrideMap
}

type SubagentForwardingResult = {
  stateSeed?: Pick<
    TeachingSessionState,
    "currentSurface" | "focusGoalIds" | "persona" | "sessionId" | "teachingWorkspaceState"
  >
  toolOverrides?: ToolOverrideMap
}

type ToolModelInput = unknown

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
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

export function specializedToolIDs(input: {
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
}): ToolOverrideMap {
  const existing = parseToolOverrides(input.existing) ?? {}
  const forwarded: ToolOverrideMap = {}

  for (const toolID of input.allToolIDs) {
    forwarded[toolID] = input.allowedToolIDs.has(toolID) && existing[toolID] !== false
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
  const messages = await piRuntime.listMessages(input.directory, input.sessionID)
  const message = messages.findLast((entry) => entry.info.role === "user")
  if (!message || message.info.role !== "user") {
    return undefined
  }

  return {
    agent: message.info.agent,
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
  const session = await piRuntime
    .getSessionInfo(input.directory, input.sessionID)
    .catch(() => undefined)
  if (!session) {
    return undefined
  }
  const parentSessionID = session.parentID
  const parentSession = parentSessionID
    ? await piRuntime.getSessionInfo(input.directory, parentSessionID).catch(() => undefined)
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
    ...(parentState?.sessionRuntime ? { parentSessionRuntime: parentState.sessionRuntime } : {}),
    ...(parentUserPrompt?.tools ? { parentUserTools: parentUserPrompt.tools } : {}),
    ...(parentUserPrompt?.agent ? { parentUserAgent: parentUserPrompt.agent } : {}),
  }
}

function resolvePersonaVisibleToolIDs(input: {
  allToolIDs: readonly string[]
  personaID: Persona
  projectConfig: MessageProjectConfig
  teachingWorkspaceState: TeachingWorkspaceState
}): Set<string> {
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

  return new Set(
    input.allToolIDs.filter(
      (toolID) =>
        DEFAULT_BRIDGED_OPENCODE_TOOL_ID_SET.has(toolID) ||
        sessionRuntime.access.tools[toolID] === "allow" ||
        dynamicToolSearchTools.some((tool) => tool.id === toolID),
    ),
  )
}

function resolveSessionRuntimeVisibleToolIDs(input: {
  allToolIDs: readonly string[]
  configuredToolToggles: Config.Info["tools"] | undefined
  sessionRuntime: NonNullable<TeachingSessionState["sessionRuntime"]>
  teachingWorkspaceState: TeachingWorkspaceState
}): Set<string> {
  return new Set(
    input.allToolIDs.filter((toolID) => {
      if (DEFAULT_BRIDGED_OPENCODE_TOOL_ID_SET.has(toolID)) {
        return true
      }

      if (dynamicToolSearchTools.some((tool) => tool.id === toolID)) {
        return true
      }

      if (input.sessionRuntime.access.tools[toolID] !== "allow") {
        return false
      }

      return currentRuntimeAllowsTool({
        configuredToolToggles: input.configuredToolToggles,
        teachingWorkspaceState: input.teachingWorkspaceState,
        toolID,
      })
    }),
  )
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
  if (!input.previousState && !context.hasParentSession && explicitCurrentTools) {
    return {}
  }

  const allToolIDs = [
    ...new Set([
      ...DEFAULT_BRIDGED_OPENCODE_TOOL_NAMES,
      ...dynamicToolSearchTools.map((tool) => tool.id),
      ...allBuddyTools().map((tool) => tool.id),
      "task",
    ]),
  ]
  const personaVisibility = context.parentUserAgent
    ? undefined
    : resolvePersonaVisibleToolIDs({
        allToolIDs,
        personaID: context.personaID,
        projectConfig: input.projectConfig,
        teachingWorkspaceState: context.teachingWorkspaceState,
      })
  const parentRuntimeVisibility = context.parentSessionRuntime
    ? resolveSessionRuntimeVisibleToolIDs({
        allToolIDs,
        configuredToolToggles: input.projectConfig.tools,
        sessionRuntime: context.parentSessionRuntime,
        teachingWorkspaceState: context.teachingWorkspaceState,
      })
    : undefined

  const inheritedToolIDs = context.parentUserAgent
    ? context.parentUserTools
      ? new Set(
          [...(parentRuntimeVisibility ?? resolvePersonaVisibleToolIDs({
            allToolIDs,
            personaID: context.personaID,
            projectConfig: input.projectConfig,
            teachingWorkspaceState: context.teachingWorkspaceState,
          }))].filter((toolID) => context.parentUserTools?.[toolID] !== false),
        )
      : (parentRuntimeVisibility ??
          resolvePersonaVisibleToolIDs({
            allToolIDs,
            personaID: context.personaID,
            projectConfig: input.projectConfig,
            teachingWorkspaceState: context.teachingWorkspaceState,
          }))
    : (personaVisibility ?? new Set<string>())

  const allowedToolIDs = new Set<string>([
    ...inheritedToolIDs,
    ...specializedToolIDs({
      allToolIDs,
      configuredToolToggles: input.projectConfig.tools,
      targetAgent: input.targetAgent,
      teachingWorkspaceState: context.teachingWorkspaceState,
    }),
  ])

  if (context.policy !== true) {
    for (const toolID of context.policy.denyTools ?? []) {
      allowedToolIDs.delete(toolID)
    }
  }

  return {
    toolOverrides: buildToolOverrides({
      allowedToolIDs,
      allToolIDs,
      existing: input.currentTools,
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
