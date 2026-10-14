import z from "zod"
import { ToolError, type PluginContext } from "@buddy/opencode-adapter/plugin"
import { evaluatePermission, permissionRulesFromConfig } from "@buddy/transcript-contract/permission-rules"
import { toBuddyPermissionRules } from "@buddy/opencode-adapter/gateway/permission"
import { buildDelegatedChildSessionPermissions } from "../../learning/agent-execution/permissions/delegated-permissions"
import {
  buddyTeachingPolicyRevision, hydrateBuddyTeachingState, persistBuddyTeachingSnapshot,
  publishBuddyDelegationSource, readBuddyTeachingSnapshot, withBuddyTeachingSessionUpdate,
  type BuddyTeachingSnapshot,
} from "../../learning/agent-execution/state/teaching-session-metadata"
import { readTeachingSessionState } from "../../learning/agent-execution/state/session-state"
import { getBuddySubagentDefinition } from "../../learning/subagent-manifest"
import { isPersona, isPersonaDelegateId, PERSONA_DELEGATE_IDS } from "../../learning/shared/teaching-vocabulary"
import { getBuddyPersona } from "../../learning/personas/wiring/persona-profiles"
import { resolveConciseResponses } from "../../learning/shared/concise-responses"
import { readAuthoredPermissionRules } from "../../learning/agent-execution/permissions/authored-permissions"
import { Config } from "../../config/config"

const spawnInput = z.object({ agent: z.string(), sessionID: z.string().optional() })
const internal = (agent: string | undefined) => agent !== undefined && getBuddySubagentDefinition(agent)?.delegatable === false

export async function registerBuddySubagentHooks(ctx: PluginContext): Promise<void> {
  const directory = ctx.location.directory
  const hydrate = async (event: { readonly sessionID: string }) => {
    const current = await ctx.session.get({ sessionID: event.sessionID })
    if (internal(current.agent)) return
    if (current.parentID && current.agent && isPersonaDelegateId(current.agent) && !readBuddyTeachingSnapshot(current.metadata)) {
      const parent = await ctx.session.get({ sessionID: current.parentID })
      if (readBuddyTeachingSnapshot(parent.metadata) || isPersona(parent.agent ?? "")) throw new ToolError({ message: `Missing Buddy child preparation: ${current.id}` })
    }
    await hydrateBuddyTeachingState({ session: ctx.session, directory, sessionID: event.sessionID })
  }
  await ctx.session.hook("context", hydrate)
  await ctx.session.hook("compaction", hydrate)
  await ctx.session.hook("generate", hydrate)
  await ctx.session.hook("prompt", async (event) => {
    await withBuddyTeachingSessionUpdate(event.sessionID, async () => {
      const current = await ctx.session.get({ sessionID: event.sessionID })
      if (internal(current.agent)) return
      if (isPersona(current.agent ?? "")) {
        await publishBuddyDelegationSource({ ctx, sessionID: current.id })
        return
      }
      if (!current.agent || !isPersonaDelegateId(current.agent)) return
      const owned = readBuddyTeachingSnapshot(current.metadata)
      if (current.metadata?.buddyTeaching !== undefined && !owned) throw new ToolError({ message: `Invalid Buddy teaching snapshot: ${current.id}` })
      const parent = current.parentID ? await ctx.session.get({ sessionID: current.parentID }) : undefined
      if (owned?.ownerSessionID === current.id && owned.roleID && owned.roleID !== current.agent) {
        throw new ToolError({ message: `Continue ${current.id} with ${owned.roleID}; start a fresh child for ${current.agent}` })
      }
      let source = !parent ? await publishBuddyDelegationSource({ ctx, sessionID: current.id, persist: false }) : owned?.ownerSessionID === current.id
        ? readBuddyTeachingSnapshot(parent.metadata)
        : owned ?? readBuddyTeachingSnapshot(parent.metadata)
      if (!source && parent && isPersona(parent.agent ?? "")) source = await withBuddyTeachingSessionUpdate(parent.id, () => publishBuddyDelegationSource({ ctx, sessionID: parent.id }))
      if (!source) {
        if (parent && isPersona(parent.agent ?? "")) throw new ToolError({ message: `Missing Buddy delegation source: ${parent.id}` })
        return
      }
      if (parent && source.ownerSessionID !== parent.id) throw new ToolError({ message: `Invalid Buddy delegation lineage: ${current.id}` })
      if (source.source.access.subagents[current.agent] !== "allow" && source.source.access.subagents[current.agent] !== "ask") return
      const config = await Config.getProject(directory)
      const previous = readTeachingSessionState(directory, current.id)
      const initialized = owned?.ownerSessionID === current.id && owned.roleID !== undefined
      const persona = previous?.persona ?? (initialized ? owned.teaching.persona : source.teaching.persona)
      const workspace = previous?.teachingWorkspaceState ?? (initialized ? owned.teaching.teachingWorkspaceState : source.teaching.teachingWorkspaceState)
      const profile = getBuddyPersona(persona, config.personas)
      const concise = resolveConciseResponses(config)
      const teaching = initialized ? { ...owned.teaching, ...previous, focusGoalIds: [...(previous?.focusGoalIds ?? owned.teaching.focusGoalIds)] } : {
        persona, teachingWorkspaceState: workspace,
        currentSurface: workspace === "active" && profile.surfaces.includes("editor") ? "editor" : profile.defaultSurface,
        focusGoalIds: [...(previous?.focusGoalIds ?? source.teaching.focusGoalIds)],
        conciseResponses: previous?.conciseResponses ?? concise,
        baseConciseResponses: previous?.baseConciseResponses ?? concise,
      }
      const definition = getBuddySubagentDefinition(current.agent)
      const nativeRole = (await ctx.agent.get({ location: { directory }, agentID: current.agent })).data
      const rolePermissions = definition ? permissionRulesFromConfig(definition.permission ?? {}) : toBuddyPermissionRules(nativeRole.permissions)
      const catalog = await ctx.tool.list()
      const toolActions = Object.fromEntries(catalog.map((tool) => [tool.name, tool.options?.permission ?? tool.name]))
      const configured = await readAuthoredPermissionRules(directory, current.agent)
      const permissions = buildDelegatedChildSessionPermissions({
        parentRuntime: { access: source.source.access }, existing: toBuddyPermissionRules(current.permissions ?? []),
        source: source.source.rules, priorSource: owned?.source.rules, configured, rolePermissions, toolActions,
        extraTools: source.source.extraToolsByRole[current.agent],
        denyTools: [...(source.source.denyToolsByRole[current.agent] ?? []), ...(current.agent === "curriculum-orchestrator" ? [] : ["subagent"])],
        platform: process.platform === "win32" ? "win32" : "posix",
      })
      const policyRevision = buddyTeachingPolicyRevision({ source: source.revision, role: current.agent, permissions })
      await ctx.session.update({ sessionID: current.id, permissions })
      const delegated = toBuddyPermissionRules(permissions)
      const childSource = structuredClone(source.source)
      childSource.rules = delegated
      childSource.access.tools = Object.fromEntries(Object.keys(childSource.access.tools).map((tool) => [tool, evaluatePermission(toolActions[tool] ?? tool, "*", delegated).action]))
      childSource.access.subagents = Object.fromEntries(PERSONA_DELEGATE_IDS.map((role) => [role, evaluatePermission("subagent", role, delegated).action]))
      const snapshot: BuddyTeachingSnapshot = {
        version: 1, ownerSessionID: current.id, rootSessionID: source.rootSessionID,
        revision: policyRevision, roleID: current.agent, policyRevision,
        teaching: { persona: teaching.persona, teachingWorkspaceState: teaching.teachingWorkspaceState,
          currentSurface: teaching.currentSurface, focusGoalIds: teaching.focusGoalIds,
          conciseResponses: teaching.conciseResponses ?? concise, baseConciseResponses: teaching.baseConciseResponses ?? concise },
        source: childSource,
      }
      await persistBuddyTeachingSnapshot({ session: ctx.session, sessionID: current.id, snapshot })
    })
  })
  await ctx.tool.hook("execute.before", async (event) => {
    if (event.tool !== "subagent") return
    const parsed = spawnInput.safeParse(event.input)
    if (!parsed.success) throw new ToolError({ message: "Invalid subagent input" })
    const input = parsed.data
    const parent = await ctx.session.get({ sessionID: event.sessionID })
    if (input.sessionID) {
      const child = await ctx.session.get({ sessionID: input.sessionID }).catch((cause) => {
        throw new ToolError({ message: `Subagent session not found: ${input.sessionID}`, error: cause })
      })
      if (child.parentID !== parent.id) throw new ToolError({ message: `Session ${child.id} is not a child of the current session` })
      const snapshot = readBuddyTeachingSnapshot(child.metadata)
      const role = snapshot?.roleID ?? (readBuddyTeachingSnapshot(parent.metadata) && child.agent && isPersonaDelegateId(child.agent) ? child.agent : undefined)
      if (role && role !== input.agent) throw new ToolError({ message: `Continue ${child.id} with ${role}; start a fresh child for ${input.agent}` })
    }
    if (internal(parent.agent)) return
    await withBuddyTeachingSessionUpdate(parent.id, async () => {
      const snapshot = isPersona(parent.agent ?? "")
        ? await publishBuddyDelegationSource({ ctx, sessionID: parent.id })
        : readBuddyTeachingSnapshot(parent.metadata)
      if (isPersona(parent.agent ?? "") && !snapshot) throw new ToolError({ message: `Missing Buddy delegation source: ${parent.id}` })
    })
  })
}
