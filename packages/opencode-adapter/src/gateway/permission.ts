import {
  isSessionNotFoundError,
  type OpenCodeClient,
  type OpenCodeEvent,
  type PermissionRequest as OpenCodePermissionRequest,
} from "@opencode/client"
import type {
  PermissionEvent,
  PermissionReplyInput,
  PermissionRequest,
  SavedPermission,
} from "@buddy/transcript-contract/permission"
import {
  toSessionPermissionRules,
  toBuddyPermissionRules,
  permissionRulesEqual,
  type PermissionRuleset,
} from "@buddy/transcript-contract/permission-rules"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"

export type PermissionClient = Pick<OpenCodeClient, "permission" | "location"> &
  PermissionRuntimeClient
export type PermissionRuntimeClient = { sessions: OpenCodeClient["session"] }

function toBuddyPermissionAction(action: string): string {
  switch (action) {
    case "external_directory":
      return "outside_notebook"
    case "opencode_list_mcp_resources":
      return "list_mcp_resources"
    case "opencode_read_mcp_resource":
      return "read_mcp_resource"
    default:
      return action
  }
}

function toBuddyPermissionRequest(request: OpenCodePermissionRequest): PermissionRequest {
  const file = parseStringValue(request.metadata?.filepath)
  const command = parseStringValue(request.metadata?.command)
  return {
    id: request.id,
    sessionID: request.sessionID,
    action: toBuddyPermissionAction(request.action),
    file: file === "" ? undefined : file,
    command: command === "" ? undefined : command,
    resources: request.resources,
    save: request.save,
    metadata: request.metadata,
    source:
      request.source === undefined
        ? undefined
        : { messageID: request.source.messageID, callID: request.source.id },
    message: request.message,
  }
}

export function toBuddyPermissionEvent(
  event: Extract<OpenCodeEvent, { type: "permission.asked" | "permission.replied" }>,
): PermissionEvent {
  if (event.type === "permission.asked")
    return { type: event.type, properties: toBuddyPermissionRequest(event.data) }
  return { type: event.type, properties: { ...event.data } }
}

export async function listPendingPermissionsForSessions(
  client: Pick<PermissionClient, "permission">,
  sessionIDs: readonly string[],
): Promise<PermissionRequest[]> {
  const pending: PermissionRequest[] = []
  for (const sessionID of sessionIDs) {
    const requests = await client.permission.list({ sessionID })
    pending.push(...requests.map(toBuddyPermissionRequest))
  }
  return pending
}

export async function getPendingPermission(
  client: Pick<PermissionClient, "permission">,
  sessionID: string,
  requestID: string,
): Promise<PermissionRequest> {
  return toBuddyPermissionRequest(await client.permission.get({ sessionID, requestID }))
}

export async function replyToPermission(
  client: Pick<PermissionClient, "permission">,
  input: PermissionReplyInput & { sessionID: string; requestID: string },
): Promise<void> {
  await client.permission.reply({
    sessionID: input.sessionID,
    requestID: input.requestID,
    decision: input.reply,
    message: input.message,
  })
}

export async function listSavedPermissions(
  client: Pick<PermissionClient, "permission" | "location">,
  directory: string,
): Promise<SavedPermission[]> {
  const location = await client.location.get({ location: { directory } })
  const saved = await client.permission.saved.list({ projectID: location.project.id })
  return saved.map((rule) => ({
    id: rule.id,
    projectID: rule.projectID,
    action: toBuddyPermissionAction(rule.action),
    resource: rule.resource,
    created: rule.time.created,
    updated: rule.time.updated,
  }))
}

export async function removeSavedPermission(
  client: Pick<PermissionClient, "permission" | "location">,
  directory: string,
  id: string,
): Promise<boolean> {
  const saved = await listSavedPermissions(client, directory)
  if (!saved.some((rule) => rule.id === id)) return false
  await client.permission.saved.remove({ id })
  return true
}

export async function readSessionPermissions(client: PermissionRuntimeClient, sessionID: string) {
  try {
    const session = await client.sessions.get({ sessionID })
    return {
      permissions: toBuddyPermissionRules(session.permissions ?? []),
      hasParentSession: session.parentID !== undefined,
      agent: session.agent,
    }
  } catch (error) {
    if (isSessionNotFoundError(error)) return undefined
    throw error
  }
}

type PermissionUpdate = "updated" | "unchanged" | "missing"
const updatesByClient = new WeakMap<
  PermissionRuntimeClient,
  Map<string, Promise<PermissionUpdate>>
>()

export async function updateSessionPermissions(
  client: PermissionRuntimeClient,
  sessionID: string,
  update: (rules: PermissionRuleset, hasParentSession: boolean) => PermissionRuleset,
): Promise<PermissionUpdate> {
  let updates = updatesByClient.get(client)
  if (updates === undefined) {
    updates = new Map()
    updatesByClient.set(client, updates)
  }
  const previous = updates.get(sessionID)
  const task = (previous === undefined ? Promise.resolve() : previous.catch(() => undefined)).then(
    async (): Promise<PermissionUpdate> => {
      try {
        const session = await client.sessions.get({ sessionID })
        const next = toSessionPermissionRules(
          update(toBuddyPermissionRules(session.permissions ?? []), session.parentID !== undefined),
        )
        if (permissionRulesEqual(session.permissions ?? [], next)) return "unchanged"
        await client.sessions.update({ sessionID, permissions: next })
        return "updated"
      } catch (error) {
        if (isSessionNotFoundError(error)) return "missing"
        throw error
      }
    },
  )
  updates.set(sessionID, task)
  try {
    return await task
  } finally {
    if (updates.get(sessionID) === task) updates.delete(sessionID)
  }
}
