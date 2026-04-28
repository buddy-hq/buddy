import { Effect } from "effect"
import * as OpenCodeSession from "opencode/session/session"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)
const patchedServices = new WeakSet<OpenCodeSession.Interface>()
const liveSessions = new Map<string, OpenCodeSession.Info>()
const MAX_LIVE_SESSION_CACHE_SIZE = 256
let patchPromise: Promise<void> | undefined

function cacheKey(sessionID: string): string {
  return String(sessionID)
}

function clonePermission(
  permission: OpenCodeSession.Info["permission"],
): OpenCodeSession.Info["permission"] {
  return permission?.map((rule) => ({ ...rule }))
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

function canonicalize(session: OpenCodeSession.Info): OpenCodeSession.Info {
  const key = cacheKey(session.id)
  const existing = liveSessions.get(key)
  if (!existing) {
    touchLiveSessionCache(key, session)
    return session
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
  return existing
}

function updateCachedSession(input: {
  sessionID: string
  title?: string
  archived?: OpenCodeSession.Info["time"]["archived"]
  permission?: OpenCodeSession.Info["permission"]
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

function ensurePatched(service: OpenCodeSession.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalGet = service.get.bind(service)
  const originalCreate = service.create.bind(service)
  const originalFork = service.fork.bind(service)
  const originalChildren = service.children.bind(service)
  const originalSetTitle = service.setTitle.bind(service)
  const originalSetArchived = service.setArchived.bind(service)
  const originalSetPermission = service.setPermission.bind(service)
  const originalRemove = service.remove.bind(service)

  const get: OpenCodeSession.Interface["get"] = Effect.fn("BuddySession.get")(function* (id) {
    return canonicalize(yield* originalGet(id))
  })

  const create: OpenCodeSession.Interface["create"] = Effect.fn("BuddySession.create")(
    function* (input) {
      return canonicalize(yield* originalCreate(input))
    },
  )

  const fork: OpenCodeSession.Interface["fork"] = Effect.fn("BuddySession.fork")(function* (input) {
    return canonicalize(yield* originalFork(input))
  })

  const children: OpenCodeSession.Interface["children"] = Effect.fn("BuddySession.children")(
    function* (parentID) {
      return (yield* originalChildren(parentID)).map(canonicalize)
    },
  )

  const setTitle: OpenCodeSession.Interface["setTitle"] = Effect.fn("BuddySession.setTitle")(
    function* (input) {
      yield* originalSetTitle(input)
      updateCachedSession({
        sessionID: input.sessionID,
        title: input.title,
      })
    },
  )

  const setArchived: OpenCodeSession.Interface["setArchived"] = Effect.fn(
    "BuddySession.setArchived",
  )(function* (input) {
    yield* originalSetArchived(input)
    updateCachedSession({
      sessionID: input.sessionID,
      archived: input.time,
    })
  })

  const setPermission: OpenCodeSession.Interface["setPermission"] = Effect.fn(
    "BuddySession.setPermission",
  )(function* (input) {
    yield* originalSetPermission(input)
    updateCachedSession({
      sessionID: input.sessionID,
      permission: input.permission,
      updated: Date.now(),
    })
  })

  const remove: OpenCodeSession.Interface["remove"] = Effect.fn("BuddySession.remove")(
    function* (sessionID) {
      yield* originalRemove(sessionID)
      liveSessions.delete(cacheKey(sessionID))
    },
  )

  Object.defineProperties(service, {
    get: { value: get },
    create: { value: create },
    fork: { value: fork },
    children: { value: children },
    setTitle: { value: setTitle },
    setArchived: { value: setArchived },
    setPermission: { value: setPermission },
    remove: { value: remove },
  })
}

export async function ensureSessionServicePatched() {
  patchPromise ??= runtime
    .runPromise((svc) => Effect.sync(() => ensurePatched(svc)))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })
  await patchPromise
}

export function canonicalizeSession(session: OpenCodeSession.Info): OpenCodeSession.Info {
  return canonicalize(session)
}
