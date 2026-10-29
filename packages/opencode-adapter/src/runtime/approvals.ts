import type { Approvals } from "@buddy/agent-runtime/approvals"
import { RuntimeError } from "@buddy/agent-runtime/errors"
import {
  getPendingPermission,
  listPendingPermissionsForSessions,
  listSavedPermissions,
  readSessionPermissions,
  removeSavedPermission,
  replyToPermission,
  updateSessionPermissions,
} from "../gateway/permission"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    const error = toRuntimeError(cause)
    if (cause instanceof RuntimeError || error.kind === "internal") throw error
    if (error.kind === "not_found" && (error.subject === "session" || error.subject === "permission")) throw error
    throw new RuntimeError("internal", error.message, { subject: error.subject, cause })
  }
}

export function createApprovals(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): Approvals {
  return {
    pending(scope) {
      return request(() => listPendingPermissionsForSessions(host, scope.sessions))
    },
    get(sessionID, requestID) {
      return request(() => getPendingPermission(host, sessionID, requestID))
    },
    reply(input) {
      return request(() => replyToPermission(host, input))
    },
    saved(directory) {
      return request(() => listSavedPermissions(host, directory))
    },
    forget(directory, savedID) {
      return request(() => removeSavedPermission(host, directory, savedID))
    },
    sessionRules(sessionID) {
      return request(async () => {
        const session = await readSessionPermissions(host, sessionID)
        return session === undefined ? undefined : {
          rules: session.permissions,
          hasParentSession: session.hasParentSession,
          agent: session.agent,
        }
      })
    },
    updateSessionRules(sessionID, update) {
      return request(() => updateSessionPermissions(host, sessionID, update))
    },
  }
}
