import { isSessionNotFoundError, isPermissionNotFoundError, type OpenCodeClient, type OpenCodeEvent, type PermissionRequest as OpenCodePermissionRequest } from "@opencode/client"
import type { PermissionEvent, PermissionReplyInput, PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"
import type { PermissionRuleset, SessionPermissionRuleset } from "@buddy/transcript-contract/permission-rules"

export type PermissionClient = Pick<OpenCodeClient, "permission" | "location"> & PermissionRuntimeClient
export type PermissionRuntimeClient = { sessions: OpenCodeClient["session"] }

export function toSessionPermissionAction(action: string): string {
  switch (action) {
    case "task": return "subagent"
    case "bash": return "shell"
    case "write":
    case "patch":
    case "apply_patch":
    case "multiedit": return "edit"
    case "list_mcp_resources": return "opencode_list_mcp_resources"
    case "read_mcp_resource": return "opencode_read_mcp_resource"
    default: return action
  }
}

export function toSessionPermissionRules(rules: readonly PermissionRuleset[number][]): SessionPermissionRuleset {
  return rules.map((rule) => ({ action: toSessionPermissionAction(rule.permission), resource: rule.pattern, effect: rule.action }))
}

export function toBuddyPermissionRules(rules: readonly SessionPermissionRuleset[number][]): PermissionRuleset {
  return rules.map((rule) => ({ permission: rule.action, pattern: rule.resource, action: rule.effect }))
}

export function permissionRulesEqual(left: readonly SessionPermissionRuleset[number][], right: readonly SessionPermissionRuleset[number][]): boolean {
  return left.length === right.length && left.every((rule, index) => {
    const other = right[index]
    return other !== undefined && rule.action === other.action && rule.resource === other.resource && rule.effect === other.effect
  })
}

function toBuddyPermissionRequest(request: OpenCodePermissionRequest): PermissionRequest {
  return {
    id: request.id,
    sessionID: request.sessionID,
    action: request.action,
    resources: request.resources,
    save: request.save,
    metadata: request.metadata,
    source: request.source === undefined ? undefined : { messageID: request.source.messageID, callID: request.source.id },
    message: request.message,
  }
}

export function toBuddyPermissionEvent(event: Extract<OpenCodeEvent, { type: "permission.asked" | "permission.replied" }>): PermissionEvent {
  if (event.type === "permission.asked") return { type: event.type, properties: toBuddyPermissionRequest(event.data) }
  return { type: event.type, properties: { ...event.data } }
}

export async function listPendingPermissionsForLocation(client: Pick<PermissionClient, "permission">, directory: string): Promise<PermissionRequest[]> {
  const result = await client.permission.request.list({ location: { directory } })
  return result.data.map(toBuddyPermissionRequest)
}

export async function listPendingPermissionsForSessionTree(client: Pick<PermissionClient, "permission" | "sessions">, sessionID: string): Promise<PermissionRequest[]> {
  const seen = new Set<string>()
  const pending: PermissionRequest[] = []
  const queue = [sessionID]
  for (const id of queue) {
    if (seen.has(id)) continue
    seen.add(id)
    const requests = await client.permission.list({ sessionID: id })
    pending.push(...requests.map(toBuddyPermissionRequest))
    let cursor: string | undefined
    do {
      const children = await client.sessions.list({ parentID: id, cursor })
      queue.push(...children.data.map((child) => child.id))
      cursor = children.cursor.next ?? undefined
    } while (cursor !== undefined)
  }
  return pending
}

export async function getPendingPermission(client: Pick<PermissionClient, "permission">, sessionID: string, requestID: string): Promise<PermissionRequest> {
  return toBuddyPermissionRequest(await client.permission.get({ sessionID, requestID }))
}

export async function replyToPermission(client: Pick<PermissionClient, "permission">, input: PermissionReplyInput & { sessionID: string; requestID: string }): Promise<void> {
  await client.permission.reply({ sessionID: input.sessionID, requestID: input.requestID, decision: input.reply, message: input.message })
}

export async function listSavedPermissions(client: Pick<PermissionClient, "permission" | "location">, directory: string): Promise<SavedPermission[]> {
  const location = await client.location.get({ location: { directory } })
  const saved = await client.permission.saved.list({ projectID: location.project.id })
  return saved.map((rule) => ({ id: rule.id, projectID: rule.projectID, action: rule.action, resource: rule.resource, created: rule.time.created, updated: rule.time.updated }))
}

export async function removeSavedPermission(client: Pick<PermissionClient, "permission" | "location">, directory: string, id: string): Promise<boolean> {
  const saved = await listSavedPermissions(client, directory)
  if (!saved.some((rule) => rule.id === id)) return false
  await client.permission.saved.remove({ id })
  return true
}

export function isPermissionMissingError<TError>(error: TError): boolean {
  return isSessionNotFoundError(error) || isPermissionNotFoundError(error)
}

export async function readSessionPermissions(client: PermissionRuntimeClient, sessionID: string) {
  try {
    const session = await client.sessions.get({ sessionID })
    return { permissions: toBuddyPermissionRules(session.permissions ?? []), hasParentSession: session.parentID !== undefined, agent: session.agent }
  } catch (error) {
    if (isSessionNotFoundError(error)) return undefined
    throw error
  }
}

type PermissionUpdate = "updated" | "unchanged" | "missing"
const updatesByClient = new WeakMap<PermissionRuntimeClient, Map<string, Promise<PermissionUpdate>>>()

export async function updateSessionPermissions(client: PermissionRuntimeClient, sessionID: string, update: (rules: PermissionRuleset, hasParentSession: boolean) => PermissionRuleset): Promise<PermissionUpdate> {
  let updates = updatesByClient.get(client)
  if (updates === undefined) {
    updates = new Map()
    updatesByClient.set(client, updates)
  }
  const previous = updates.get(sessionID)
  const task = (previous === undefined ? Promise.resolve() : previous.catch(() => undefined)).then(async (): Promise<PermissionUpdate> => {
    try {
      const session = await client.sessions.get({ sessionID })
      const next = toSessionPermissionRules(update(toBuddyPermissionRules(session.permissions ?? []), session.parentID !== undefined))
      if (permissionRulesEqual(session.permissions ?? [], next)) return "unchanged"
      await client.sessions.update({ sessionID, permissions: next })
      return "updated"
    } catch (error) {
      if (isSessionNotFoundError(error)) return "missing"
      throw error
    }
  })
  updates.set(sessionID, task)
  try {
    return await task
  } finally {
    if (updates.get(sessionID) === task) updates.delete(sessionID)
  }
}
