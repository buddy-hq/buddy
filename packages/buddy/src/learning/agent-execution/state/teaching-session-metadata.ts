import { createHash } from "node:crypto"
import z from "zod"
import type { PluginContext } from "@buddy/opencode-adapter/plugin"
import { ToolError } from "@buddy/opencode-adapter/plugin"
import { toBuddyPermissionRules } from "@buddy/opencode-adapter/gateway/permission"
import { evaluatePermission, permissionRulesFromConfig } from "@buddy/transcript-contract/permission-rules"
import { Config } from "../../../config/config"
import { PERSONAS, SURFACES, TEACHING_WORKSPACE_STATES } from "../../shared/teaching-vocabulary"
import type { TeachingSessionState } from "../../shared/teaching-session-state"
import { readTeachingSessionState, writeTeachingSessionState } from "./session-state"
import { resolveSessionRuntime } from "../../access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../personas/registry"
import { getBuddyPersona, getDefaultBuddyPersona } from "../../personas/wiring/persona-profiles"
import { resolveConciseResponses } from "../../shared/concise-responses"
import { listBuddySubagentDefinitions } from "../../subagent-manifest"
import { allLearningToolIds, getLearningToolMetadata } from "../../runtime/tool-metadata"
import { allDynamicLearningToolIds } from "../../runtime/dynamic-tool-catalog"
import { toolMatchesRuntimeConstraints } from "../../runtime/tool-constraints"

const access = z.record(z.string(), z.enum(["allow", "ask", "deny"]))
const rules = z.array(z.object({ permission: z.string(), pattern: z.string(), action: z.enum(["allow", "ask", "deny"]) }))
const teaching = z.object({
  persona: z.enum(PERSONAS), currentSurface: z.enum(SURFACES),
  teachingWorkspaceState: z.enum(TEACHING_WORKSPACE_STATES), focusGoalIds: z.array(z.string()),
  conciseResponses: z.boolean(), baseConciseResponses: z.boolean(),
})
export const BuddyTeachingSnapshot = z.object({
  version: z.literal(1), ownerSessionID: z.string().min(1), rootSessionID: z.string().min(1),
  revision: z.string().min(1), roleID: z.string().optional(), policyRevision: z.string().optional(),
  teaching,
  source: z.object({
    rules, access: z.object({ tools: access, subagents: access, skills: access }),
    enabledFeatureIDs: z.array(z.string()),
    extraToolsByRole: z.record(z.string(), z.array(z.string())),
    denyToolsByRole: z.record(z.string(), z.array(z.string())),
  }),
})
export type BuddyTeachingSnapshot = z.infer<typeof BuddyTeachingSnapshot>
export type TeachingSessionPort = Pick<PluginContext["session"], "get" | "update">
const updates = new Map<string, Promise<void>>()

export async function withBuddyTeachingSessionUpdate<T>(sessionID: string, run: () => Promise<T>): Promise<T> {
  const previous = updates.get(sessionID) ?? Promise.resolve()
  const gate = Promise.withResolvers<void>()
  updates.set(sessionID, gate.promise)
  await previous
  try { return await run() } finally {
    gate.resolve()
    if (updates.get(sessionID) === gate.promise) updates.delete(sessionID)
  }
}

export function readBuddyTeachingSnapshot<T>(metadata: T): BuddyTeachingSnapshot | undefined {
  const parsed = z.object({ buddyTeaching: BuddyTeachingSnapshot }).safeParse(metadata)
  return parsed.success ? parsed.data.buddyTeaching : undefined
}

export function buddyTeachingPolicyRevision<T>(value: T): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export async function persistBuddyTeachingSnapshot(input: {
  session: TeachingSessionPort; sessionID: string; snapshot: BuddyTeachingSnapshot
}): Promise<void> {
  const current = await input.session.get({ sessionID: input.sessionID })
  await input.session.update({ sessionID: input.sessionID, metadata: { ...current.metadata, buddyTeaching: input.snapshot } })
}

export async function publishBuddyDelegationSource(input: {
  ctx: { session: TeachingSessionPort; agent: Pick<PluginContext["agent"], "get">; location: { directory: string } }; sessionID: string; state?: TeachingSessionState; persist?: boolean
}): Promise<BuddyTeachingSnapshot> {
  const current = await input.ctx.session.get({ sessionID: input.sessionID })
  const existing = readBuddyTeachingSnapshot(current.metadata)
  if (current.metadata?.buddyTeaching !== undefined && !existing) throw new ToolError({ message: `Invalid Buddy teaching snapshot: ${current.id}` })
  const directory = input.ctx.location.directory
  const config = await Config.getProject(directory)
  const persona = getDefaultBuddyPersona({ defaultPersona: config.default_persona, primaryUse: config.personalization?.primary_use, overrides: config.personas }).id
  const state = input.state ?? readTeachingSessionState(directory, current.id) ?? (existing?.ownerSessionID === current.id ? { sessionId: current.id, ...existing.teaching } : undefined) ?? {
    sessionId: current.id, persona, currentSurface: getBuddyPersona(persona, config.personas).defaultSurface,
    teachingWorkspaceState: "inactive", focusGoalIds: [],
  }
  const definition = REGISTERED_BUDDY_PERSONAS.find((entry) => entry.id === state.persona)
  if (!definition) throw new ToolError({ message: `Unknown Buddy persona: ${state.persona}` })
  const configuredRuntime = resolveSessionRuntime({ persona: definition, teachingWorkspaceState: state.teachingWorkspaceState, config })
  const runtime = state.sessionRuntime ?? configuredRuntime
  const extraToolsByRole: Record<string, string[]> = {}
  const denyToolsByRole: Record<string, string[]> = {}
  for (const role of listBuddySubagentDefinitions()) {
    const owned = [...(role.tools ?? []).map((tool) => tool.id), ...permissionRulesFromConfig(role.permission ?? {}).filter((rule) => rule.action === "allow").map((rule) => rule.permission)]
    extraToolsByRole[role.key] = [...new Set(owned)].filter((toolID) => {
      if (config.tools?.[toolID] === false) return false
      const metadata = getLearningToolMetadata(toolID)
      if (!metadata) return false
      return configuredRuntime.enabledFeatureIDs.includes(metadata.featureID) && toolMatchesRuntimeConstraints(metadata) &&
        (metadata.constraints?.teachingWorkspace !== "active" || state.teachingWorkspaceState === "active")
    })
  }
  for (const [roleID, policy] of Object.entries(definition.runtime.subagents ?? {})) {
    denyToolsByRole[roleID] = policy === true ? [] : [...(policy?.denyTools ?? [])]
  }
  const agent = (await input.ctx.agent.get({ location: { directory }, agentID: current.agent && PERSONAS.some((id) => id === current.agent) ? current.agent : state.persona })).data
  const effectiveRules = toBuddyPermissionRules([...(agent?.permissions ?? []), ...(current.permissions ?? [])])
  const dynamic = new Set(allDynamicLearningToolIds())
  const source = {
    rules: effectiveRules,
    access: { ...runtime.access, skills: { ...runtime.access.skills }, tools: Object.fromEntries(allLearningToolIds().map((id) => [id, dynamic.has(id) && config.tools?.[id] !== false && evaluatePermission(id, "*", effectiveRules).action === "allow" ? "allow" : runtime.access.tools[id] ?? "deny"])), subagents: Object.fromEntries(Object.keys(definition.runtime.subagents ?? {}).map((id): [string, "allow"] => [id, "allow"])) },
    enabledFeatureIDs: [...configuredRuntime.enabledFeatureIDs], extraToolsByRole, denyToolsByRole,
  }
  const snapshot: BuddyTeachingSnapshot = {
    version: 1, ownerSessionID: current.id, rootSessionID: existing?.rootSessionID ?? current.id,
    revision: buddyTeachingPolicyRevision({ source, teaching: { persona: state.persona, workspace: state.teachingWorkspaceState, surface: state.currentSurface, goals: state.focusGoalIds, concise: state.conciseResponses, baseConcise: state.baseConciseResponses } }),
    teaching: { persona: state.persona, currentSurface: state.currentSurface, teachingWorkspaceState: state.teachingWorkspaceState,
      focusGoalIds: [...state.focusGoalIds], conciseResponses: state.conciseResponses ?? resolveConciseResponses(config),
      baseConciseResponses: state.baseConciseResponses ?? state.conciseResponses ?? resolveConciseResponses(config) },
    source,
  }
  if (input.persist !== false) await persistBuddyTeachingSnapshot({ session: input.ctx.session, sessionID: current.id, snapshot })
  return snapshot
}

export async function hydrateBuddyTeachingState(input: {
  session: TeachingSessionPort; directory: string; sessionID: string
}): Promise<TeachingSessionState | undefined> {
  const current = await input.session.get({ sessionID: input.sessionID })
  const snapshot = readBuddyTeachingSnapshot(current.metadata)
  if (!snapshot) {
    if (current.parentID && current.metadata?.buddyTeaching !== undefined) throw new ToolError({ message: `Invalid Buddy teaching snapshot: ${current.id}` })
    return undefined
  }
  if (snapshot.ownerSessionID !== current.id || (current.parentID && (!snapshot.roleID || !snapshot.policyRevision)) || (snapshot.roleID !== undefined && snapshot.roleID !== current.agent)) {
    throw new ToolError({ message: `Buddy child is not prepared: ${current.id}` })
  }
  if (current.parentID) {
    const seen = new Set([current.id])
    let ancestor = current
    while (ancestor.parentID) {
      if (seen.has(ancestor.parentID)) throw new ToolError({ message: `Invalid Buddy session family: ${current.id}` })
      seen.add(ancestor.parentID)
      ancestor = await input.session.get({ sessionID: ancestor.parentID }).catch((cause) => {
        throw new ToolError({ message: `Missing Buddy session family: ${current.id}`, error: cause })
      })
    }
    if (ancestor.id !== snapshot.rootSessionID) throw new ToolError({ message: `Invalid Buddy session family: ${current.id}` })
  }
  const cached = readTeachingSessionState(input.directory, current.id)
  if (cached) return cached
  const state: TeachingSessionState = { sessionId: current.id, ...snapshot.teaching, focusGoalIds: [...snapshot.teaching.focusGoalIds] }
  writeTeachingSessionState(input.directory, state)
  return state
}
