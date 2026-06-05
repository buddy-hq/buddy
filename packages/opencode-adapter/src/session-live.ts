import * as OpenCodeSession from "opencode/session/session"

const liveSessions = new Map<string, OpenCodeSession.Info>()
const MAX_LIVE_SESSION_CACHE_SIZE = 256

type SessionPermissionRule = {
  permission: string
  pattern: string
  action: "allow" | "ask" | "deny"
}

type SessionPermissionInput = readonly SessionPermissionRule[] | undefined

function cacheKey(sessionID: string): string {
  return String(sessionID)
}

function clonePermission(permission: SessionPermissionInput): OpenCodeSession.Info["permission"] {
  return permission?.map((rule) => ({ ...rule }))
}

function cloneSession(session: OpenCodeSession.Info): OpenCodeSession.Info {
  return structuredClone(session)
}

function touchLiveSessionCache(key: string, session: OpenCodeSession.Info) {
  liveSessions.delete(key)
  liveSessions.set(key, session)

  while (liveSessions.size > MAX_LIVE_SESSION_CACHE_SIZE) {
    const oldestKey = liveSessions.keys().next().value
    if (oldestKey === undefined) break
    liveSessions.delete(oldestKey)
  }
}

export function canonicalizeSession(session: OpenCodeSession.Info): OpenCodeSession.Info {
  const key = cacheKey(session.id)
  const existing = liveSessions.get(key)
  if (!existing) {
    const cached = cloneSession(session)
    touchLiveSessionCache(key, cached)
    return cloneSession(cached)
  }

  existing.slug = session.slug
  existing.version = session.version
  existing.projectID = session.projectID
  existing.directory = session.directory
  existing.workspaceID = session.workspaceID
  existing.parentID = session.parentID
  existing.title = session.title
  existing.share = session.share
  existing.summary = session.summary
  existing.revert = session.revert
  existing.permission = clonePermission(session.permission)
  existing.time = { ...session.time }

  touchLiveSessionCache(key, existing)
  return cloneSession(existing)
}

export function updateCachedSession(input: {
  sessionID: string
  title?: string
  archived?: OpenCodeSession.Info["time"]["archived"]
  permission?: SessionPermissionInput
  updated?: OpenCodeSession.Info["time"]["updated"]
}) {
  const key = cacheKey(input.sessionID)
  const session = liveSessions.get(key)
  if (!session) return

  if (input.title !== undefined) {
    session.title = input.title
  }

  if (input.permission !== undefined) {
    session.permission = clonePermission(input.permission)
  }

  const nextTime = { ...session.time }
  if (input.archived !== undefined || ("archived" in input && input.archived === undefined)) {
    nextTime.archived = input.archived
  }
  if (input.updated !== undefined) {
    nextTime.updated = input.updated
  }
  session.time = nextTime

  touchLiveSessionCache(key, session)
}

export function removeCachedSession(sessionID: string) {
  liveSessions.delete(cacheKey(sessionID))
}

// Preserved as a no-op so existing runtime bootstrap code can call it
// without depending on vendored Session.Service monkey patches.
export async function ensureSessionServicePatched() {
  return undefined
}
