import { Effect } from "effect"
import { makeRuntime } from "opencode/effect/run-service"
import * as OpenCodeSession from "opencode/session/session"
import { withCurrentInstance } from "./effect-runtime"

const liveSessions = new Map<string, OpenCodeSession.Info>()
const MAX_LIVE_SESSION_CACHE_SIZE = 256
const runtime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)
const patchedServices = new WeakSet<OpenCodeSession.Interface>()
let patchPromise: Promise<void> | undefined

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

function syncLiveSession(target: OpenCodeSession.Info, session: OpenCodeSession.Info) {
  target.slug = session.slug
  target.version = session.version
  target.projectID = session.projectID
  target.workspaceID = session.workspaceID
  target.directory = session.directory
  target.path = session.path
  target.parentID = session.parentID
  target.title = session.title
  target.agent = session.agent
  target.model = session.model ? structuredClone(session.model) : undefined
  target.summary = session.summary ? structuredClone(session.summary) : undefined
  target.cost = session.cost
  target.tokens = structuredClone(session.tokens)
  target.share = session.share ? structuredClone(session.share) : undefined
  target.metadata = session.metadata ? structuredClone(session.metadata) : undefined
  target.revert = session.revert ? structuredClone(session.revert) : undefined
  target.permission = clonePermission(session.permission)
  target.time = { ...session.time }
  return target
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

export function canonicalizeLiveSession(session: OpenCodeSession.Info): OpenCodeSession.Info {
  const key = cacheKey(session.id)
  const existing = liveSessions.get(key)
  if (!existing) {
    const cached = cloneSession(session)
    touchLiveSessionCache(key, cached)
    return cached
  }

  syncLiveSession(existing, session)
  touchLiveSessionCache(key, existing)
  return existing
}

export function canonicalizeSession(session: OpenCodeSession.Info): OpenCodeSession.Info {
  return cloneSession(canonicalizeLiveSession(session))
}

function mutateCachedSession(sessionID: string, update: (session: OpenCodeSession.Info) => void) {
  const key = cacheKey(sessionID)
  const session = liveSessions.get(key)
  if (!session) return

  update(session)
  touchLiveSessionCache(key, session)
}

export function updateCachedSession(input: {
  sessionID: string
  title?: string
  archived?: OpenCodeSession.Info["time"]["archived"]
  permission?: SessionPermissionInput
  updated?: OpenCodeSession.Info["time"]["updated"]
}) {
  mutateCachedSession(input.sessionID, (session) => {
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
  })
}

export function removeCachedSession(sessionID: string) {
  liveSessions.delete(cacheKey(sessionID))
}

function ensurePatched(service: OpenCodeSession.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalCreate = service.create.bind(service)
  const originalList = service.list.bind(service)
  const originalFork = service.fork.bind(service)
  const originalGet = service.get.bind(service)
  const originalSetTitle = service.setTitle.bind(service)
  const originalSetArchived = service.setArchived.bind(service)
  const originalSetPermission = service.setPermission.bind(service)
  const originalChildren = service.children.bind(service)
  const originalRemove = service.remove.bind(service)

  const create: OpenCodeSession.Interface["create"] = Effect.fn("BuddySession.create")(
    function* (input) {
      return canonicalizeLiveSession(yield* originalCreate(input))
    },
  )

  const list: OpenCodeSession.Interface["list"] = Effect.fn("BuddySession.list")(function* (input) {
    return (yield* originalList(input)).map(canonicalizeLiveSession)
  })

  const fork: OpenCodeSession.Interface["fork"] = Effect.fn("BuddySession.fork")(function* (input) {
    return canonicalizeLiveSession(yield* originalFork(input))
  })

  const get: OpenCodeSession.Interface["get"] = Effect.fn("BuddySession.get")(function* (id) {
    return canonicalizeLiveSession(yield* originalGet(id))
  })

  const setTitle: OpenCodeSession.Interface["setTitle"] = Effect.fn("BuddySession.setTitle")(
    function* (input) {
      yield* originalSetTitle(input)
      updateCachedSession({
        sessionID: input.sessionID,
        title: input.title,
        updated: Date.now(),
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
      updated: Date.now(),
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

  const children: OpenCodeSession.Interface["children"] = Effect.fn("BuddySession.children")(
    function* (parentID) {
      return (yield* originalChildren(parentID)).map(canonicalizeLiveSession)
    },
  )

  const remove: OpenCodeSession.Interface["remove"] = Effect.fn("BuddySession.remove")(
    function* (sessionID) {
      yield* originalRemove(sessionID)
      removeCachedSession(sessionID)
    },
  )

  Object.defineProperties(service, {
    create: { value: create },
    list: { value: list },
    fork: { value: fork },
    get: { value: get },
    setTitle: { value: setTitle },
    setArchived: { value: setArchived },
    setPermission: { value: setPermission },
    children: { value: children },
    remove: { value: remove },
  })
}

export async function ensureSessionServicePatched() {
  patchPromise ??= runtime
    .runPromise((service) => withCurrentInstance(Effect.sync(() => ensurePatched(service))))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })

  await patchPromise
}
