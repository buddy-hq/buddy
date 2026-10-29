import type { Conversations } from "@buddy/agent-runtime/conversations"
import { getMessage, listMessages } from "../gateway/message"
import {
  children,
  createSession,
  deleteSession,
  forkSession,
  getSession,
  listSessions,
  revertSession,
  unrevertSession,
  updateSession,
} from "../gateway/session"
import { openCodeV1ImportCommandDisplay, openCodeV1ImportHasCommandDisplays, type OpenCodeHost } from "../host"
import { patchSessionMetadata, withSessionMetadataLock } from "../session-metadata"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

async function request<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    throw toRuntimeError(cause)
  }
}

export function createConversations(host: OpenCodeHost, options: OpenCodeRuntimeOptions): Conversations {
  return {
    get(sessionID) {
      return request(() => getSession(host, sessionID))
    },
    list(query) {
      return request(() => listSessions(host, {
        directory: query.directory,
        project: query.project,
        roots: query.roots,
        parentID: query.parentID,
        search: query.search,
        start: query.updatedSince,
        limit: query.limit,
        ownsSession: query.include,
      }))
    },
    children(sessionID) {
      return request(() => children(host, sessionID))
    },
    create(directory, input) {
      return request(() => createSession(host, directory, input))
    },
    update(sessionID, input) {
      return request(() => withSessionMetadataLock(sessionID, () => updateSession(host, sessionID, input)))
    },
    patchMetadata(sessionID, patch) {
      return request(async () => {
        await patchSessionMetadata(host.session, sessionID, patch)
        return getSession(host, sessionID)
      })
    },
    remove(sessionID) {
      return request(async () => { await deleteSession(host, sessionID) })
    },
    fork(sessionID, input) {
      return request(() => forkSession(host, sessionID, input?.beforeMessageID))
    },
    revert(sessionID, messageID) {
      return request(() => revertSession(host, sessionID, messageID))
    },
    unrevert(sessionID) {
      return request(() => unrevertSession(host, sessionID))
    },
    history(scope, page) {
      return request(() => listMessages(host, { ...scope, shellOutputClient: host, presentation: options.presentation?.(scope.directory), importedCommandDisplay: openCodeV1ImportHasCommandDisplays() ? openCodeV1ImportCommandDisplay : undefined }, page))
    },
    message(scope, messageID) {
      return request(() => getMessage(host, { ...scope, shellOutputClient: host, presentation: options.presentation?.(scope.directory), importedCommandDisplay: openCodeV1ImportHasCommandDisplays() ? openCodeV1ImportCommandDisplay : undefined }, messageID))
    },
    transcript(sessionID) {
      return request(async () => {
        const session = await getSession(host, sessionID)
        const { items } = await listMessages(host, {
          sessionID,
          directory: session.directory,
          shellOutputClient: host,
          presentation: options.presentation?.(session.directory),
          importedCommandDisplay: openCodeV1ImportHasCommandDisplays() ? openCodeV1ImportCommandDisplay : undefined,
        })
        return { session, messages: items }
      })
    },
  }
}
