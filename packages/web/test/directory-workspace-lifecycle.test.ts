import { afterEach, describe, expect, test } from "bun:test"
import { setRuntimeServerConnection } from "../src/context/server"
import { DirectoryWorkspaceLifecycleService } from "../src/lib/directory-workspace-lifecycle"
import type {
  BenchLeaveGuardInput,
  BenchLeaveGuardResult,
} from "../src/lib/bench-leave-guard"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  benchTargetKey,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import {
  BENCH_ROUTE_STATUS_OPEN,
  createExpandedWorkspaceState,
  type EffectiveWorkspaceProjection,
} from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/lifecycle-test"
const TARGET = {
  type: "workspace-file",
  path: "docs/intro.md",
  viewer: "file",
} satisfies BenchTarget
const OTHER_TARGET = {
  type: "workspace-file",
  path: "docs/other.md",
  viewer: "markdown",
} satisfies BenchTarget
const RESOURCE_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
type PublishBodyProbe = {
  idempotencyKey: string
  publicationSequence: number
  value: { status: string }
}

type PublishContextProbe = {
  value?: {
    content?: string
  }
}

type ContextPublicationProbe = {
  sessionID: string
  generation: number
  publicationSequence: number
  status: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readPublishBodyProbe(value: unknown): PublishBodyProbe {
  if (!isRecord(value)) {
    throw new Error("Expected publish body to be an object.")
  }
  const idempotencyKey = value.idempotencyKey
  const publicationSequence = value.publicationSequence
  const contextValue = value.value
  if (
    typeof idempotencyKey !== "string" ||
    typeof publicationSequence !== "number" ||
    !isRecord(contextValue) ||
    typeof contextValue.status !== "string"
  ) {
    throw new Error("Expected publish body idempotency key and sequence.")
  }
  return {
    idempotencyKey,
    publicationSequence,
    value: { status: contextValue.status },
  }
}

function readPublishContextProbe(value: unknown): PublishContextProbe {
  if (!isRecord(value)) {
    throw new Error("Expected publish body to be an object.")
  }
  const contextValue = value.value
  if (!isRecord(contextValue)) return {}
  const content = contextValue.content
  if (typeof content !== "string") {
    return { value: {} }
  }
  return {
    value: {
      content,
    },
  }
}

function projectionFor(target: BenchTarget): EffectiveWorkspaceProjection {
  return {
    route: {
      status: BENCH_ROUTE_STATUS_OPEN,
      target,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    },
    dockedState: createExpandedWorkspaceState(null),
    bench: {
      visibility: "visible",
      target,
      targetKey: benchTargetKey(target),
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    },
    drawer: null,
    renderedSurface: "docked-bench",
    pending: { status: "none" },
  }
}

function openSurfaceContext(target: typeof TARGET = TARGET) {
  return {
    status: "open" as const,
    targetKey: benchTargetKey(target),
    target: {
      type: "workspace-file" as const,
      title: target.path,
      workspaceRoot: DIRECTORY,
      path: target.path,
      absolutePath: `${DIRECTORY}/${target.path}`,
      route: `/${target.path}`,
      status: "ready" as const,
    },
    metadata: [],
    content: target.path,
    refs: [],
    hints: [],
  }
}

function openObjectFallbackContext(target: Extract<BenchTarget, { type: "object" }>) {
  return {
    status: "open" as const,
    targetKey: benchTargetKey(target),
    target: {
      type: "object" as const,
      title: target.ref.objectID,
      workspaceRoot: DIRECTORY,
      ref: target.ref,
      viewID: target.viewID,
      route: `/objects/${target.ref.kind}/${target.ref.objectID}?view=${target.viewID}`,
      status: "loading" as const,
    },
    metadata: ["provider: route-fallback"],
    content: "fallback",
    refs: [],
    hints: [],
  }
}

function openObjectSurfaceContext(input: {
  target: Extract<BenchTarget, { type: "object" }>
  content: string
}) {
  return {
    status: "open" as const,
    targetKey: benchTargetKey(input.target),
    target: {
      type: "object" as const,
      title: input.target.ref.objectID,
      workspaceRoot: DIRECTORY,
      ref: input.target.ref,
      viewID: input.target.viewID,
      route: `/objects/${input.target.ref.kind}/${input.target.ref.objectID}?view=${input.target.viewID}`,
      status: "ready" as const,
    },
    metadata: ["provider: live-surface"],
    content: input.content,
    refs: [],
    hints: [],
  }
}

function allow(): BenchLeaveGuardResult {
  return { status: "allow" }
}

function block(message: string): BenchLeaveGuardResult {
  return {
    status: "block",
    reason: "dirty",
    message,
  }
}

function registerGuard(input: {
  service: DirectoryWorkspaceLifecycleService
  target: BenchTarget
  calls: string[]
  label: string
}) {
  return input.service.registerSurface({
    target: input.target,
    getSnapshot: () => ({
      target: input.target,
      targetKey: benchTargetKey(input.target),
      semanticRevision: 1,
      context: {
        status: "open",
        targetKey: benchTargetKey(input.target),
        target: {
          type: "workspace-file",
          title: input.label,
          workspaceRoot: DIRECTORY,
          path: "docs/intro.md",
          absolutePath: `${DIRECTORY}/docs/intro.md`,
          route: "/docs/intro.md",
          status: "ready",
        },
        metadata: [],
        content: input.label,
        refs: [],
        hints: [],
      },
    }),
    subscribe: () => () => undefined,
    guardLeave: () => {
      input.calls.push(input.label)
      return block(input.label)
    },
  })
}

describe("DirectoryWorkspaceLifecycleService", () => {
  afterEach(() => {
    setRuntimeServerConnection({ url: "", isSidecar: false })
  })

  test("selects the newest matching target registration and cleanup restores the previous one", async () => {
    let projection = projectionFor(TARGET)
    const service = new DirectoryWorkspaceLifecycleService({
      directory: DIRECTORY,
      getProjection: () => projection,
      getHydrationStatus: () => "ready",
      getRouteFallbackContext: () => null,
    })
    const calls: string[] = []
    const input = {
      intent: "close",
      origin: "user",
      current: TARGET,
      next: null,
    } satisfies BenchLeaveGuardInput

    const unregisterOlder = registerGuard({ service, target: TARGET, calls, label: "older" })
    const unregisterOther = registerGuard({
      service,
      target: OTHER_TARGET,
      calls,
      label: "other",
    })
    const unregisterNewer = registerGuard({ service, target: TARGET, calls, label: "newer" })

    expect(await service.guardLeave(input)).toEqual(block("newer"))
    expect(calls).toEqual(["newer"])

    unregisterNewer()
    expect(await service.guardLeave(input)).toEqual(block("older"))
    expect(calls).toEqual(["newer", "older"])

    projection = projectionFor(OTHER_TARGET)
    expect(await service.guardLeave({ ...input, current: OTHER_TARGET })).toEqual(block("other"))
    expect(calls).toEqual(["newer", "older", "other"])

    unregisterOther()
    expect(await service.guardLeave({ ...input, current: OTHER_TARGET })).toEqual(allow())

    unregisterOlder()
    projection = projectionFor(TARGET)
    expect(await service.guardLeave(input)).toEqual(allow())
    await service.dispose()
  })

  test("forced context publishes use distinct backend idempotency keys for the same snapshot", async () => {
    let projection = projectionFor(TARGET)
    let hydrationStatus: "pending" | "ready" = "pending"
    const publishBodies: unknown[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/session/session-1/context") && method === "PUT") {
          publishBodies.push(JSON.parse(String(body)))
          return new Response(
            JSON.stringify({
              data: {
                revision: 1,
                updatedAt: new Date(0).toISOString(),
                value: { status: "closed" },
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          )
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projection,
        getHydrationStatus: () => hydrationStatus,
        getRouteFallbackContext: () => null,
      })
      const leaseQuery = service.beginEventStreamLease()
      const instanceID = leaseQuery.workspaceInstanceID
      const generation = leaseQuery.connectionGeneration
      if (typeof instanceID !== "string" || typeof generation !== "number") {
        throw new Error("Expected lifecycle lease query identity.")
      }
      service.acceptLease({
        instanceID,
        generation,
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      service.setActiveSessionID("session-1")
      await service.flushContextBeforePrompt({ sessionID: "session-1" })
      expect(readPublishBodyProbe(publishBodies[0]).value).toEqual({ status: "closed" })

      hydrationStatus = "ready"
      projection = {
        ...projection,
        bench: {
          visibility: "closed",
          target: null,
          targetKey: null,
          mode: null,
        },
        route: { status: "closed" },
        renderedSurface: "empty",
      }

      await service.flushContextBeforePrompt({ sessionID: "session-1" })
      await service.flushContextBeforePrompt({ sessionID: "session-1" })

      expect(publishBodies).toHaveLength(4)
      const firstForcedClosed = readPublishBodyProbe(publishBodies[2])
      const secondForcedClosed = readPublishBodyProbe(publishBodies[3])
      expect(firstForcedClosed.publicationSequence).toBe(3)
      expect(secondForcedClosed.publicationSequence).toBe(4)
      expect(firstForcedClosed.idempotencyKey).not.toBe(secondForcedClosed.idempotencyKey)
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("prompt flush synchronizes the active workspace file before publishing context", async () => {
    const publishBodies: unknown[] = []
    const syncReasons: string[] = []
    let content = "before-sync"
    let semanticRevision = 1
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/session/session-1/context") && method === "PUT") {
          publishBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ revision: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      service.registerSurface({
        target: TARGET,
        getSnapshot: () => ({
          target: TARGET,
          targetKey: benchTargetKey(TARGET),
          semanticRevision,
          context: {
            ...openSurfaceContext(TARGET),
            content,
          },
        }),
        subscribe: () => () => undefined,
        synchronize: async (reason) => {
          syncReasons.push(reason)
          content = "after-sync"
          semanticRevision += 1
          return { changed: true }
        },
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await service.setActiveSessionID("session-1")
      publishBodies.length = 0

      await service.flushContextBeforePrompt({ sessionID: "session-1" })

      expect(syncReasons).toEqual(["context-flush"])
      expect(publishBodies).toHaveLength(1)
      expect(readPublishContextProbe(publishBodies[0]).value?.content).toBe("after-sync")
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("watcher synchronization publishes only matching workspace file paths", async () => {
    const publishBodies: unknown[] = []
    const syncReasons: string[] = []
    let content = "before-watcher"
    let semanticRevision = 1
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/session/session-1/context") && method === "PUT") {
          publishBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ revision: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      service.registerSurface({
        target: TARGET,
        getSnapshot: () => ({
          target: TARGET,
          targetKey: benchTargetKey(TARGET),
          semanticRevision,
          context: {
            ...openSurfaceContext(TARGET),
            content,
          },
        }),
        subscribe: () => () => undefined,
        synchronize: async (reason) => {
          syncReasons.push(reason)
          content = "after-watcher"
          semanticRevision += 1
          return { changed: true }
        },
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await service.setActiveSessionID("session-1")
      publishBodies.length = 0

      await service.synchronizeWorkspaceFile({
        path: "docs",
        reason: "watcher",
      })
      await service.synchronizeWorkspaceFile({
        path: "unrelated",
        reason: "watcher",
      })

      expect(syncReasons).toEqual(["watcher"])
      expect(publishBodies).toHaveLength(1)
      expect(readPublishContextProbe(publishBodies[0]).value?.content).toBe("after-watcher")
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("turn-complete synchronization publishes the active workspace file without a watcher path", async () => {
    const publishBodies: unknown[] = []
    const syncReasons: string[] = []
    let content = "before-turn-complete"
    let semanticRevision = 1
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/session/session-1/context") && method === "PUT") {
          publishBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ revision: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      service.registerSurface({
        target: TARGET,
        getSnapshot: () => ({
          target: TARGET,
          targetKey: benchTargetKey(TARGET),
          semanticRevision,
          context: {
            ...openSurfaceContext(TARGET),
            content,
          },
        }),
        subscribe: () => () => undefined,
        synchronize: async (reason) => {
          syncReasons.push(reason)
          content = "after-turn-complete"
          semanticRevision += 1
          return { changed: true }
        },
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await service.setActiveSessionID("session-1")
      publishBodies.length = 0

      await service.synchronizeCurrentWorkspaceFile({
        reason: "turn-complete",
      })

      expect(syncReasons).toEqual(["turn-complete"])
      expect(publishBodies).toHaveLength(1)
      expect(readPublishContextProbe(publishBodies[0]).value?.content).toBe(
        "after-turn-complete",
      )
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("captures raw markdown-file context before waiting behind ordinary publication", async () => {
    let projection = projectionFor(TARGET)
    let releaseContextPublish: (() => void) | undefined
    let markContextPublishStarted: (() => void) | undefined
    let contextPublishCount = 0
    const contextPublishStarted = new Promise<void>((resolve) => {
      markContextPublishStarted = resolve
    })
    const completionBodies: unknown[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/session/session-1/context") && method === "PUT") {
          contextPublishCount += 1
          if (contextPublishCount === 1) {
            markContextPublishStarted?.()
            await new Promise<void>((resolve) => {
              releaseContextPublish = resolve
            })
          }
          return new Response(JSON.stringify({ revision: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (url.includes("/bench/client-actions/action-1/complete") && method === "POST") {
          completionBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ status: "completed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projection,
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      service.registerSurface({
        target: TARGET,
        getSnapshot: () => ({
          target: TARGET,
          targetKey: benchTargetKey(TARGET),
          semanticRevision: 1,
          context: {
            status: "open",
            targetKey: benchTargetKey(TARGET),
            target: {
              type: "workspace-file",
              title: "intro",
              workspaceRoot: DIRECTORY,
              path: TARGET.path,
              absolutePath: `${DIRECTORY}/${TARGET.path}`,
              route: "/docs/intro.md",
              status: "ready",
            },
            metadata: [],
            content: "intro",
            refs: [],
            hints: [],
          },
        }),
        subscribe: () => () => undefined,
      })
      service.registerSurface({
        target: OTHER_TARGET,
        getSnapshot: () => ({
          target: OTHER_TARGET,
          targetKey: benchTargetKey(OTHER_TARGET),
          semanticRevision: 1,
          context: {
            status: "open",
            targetKey: benchTargetKey(OTHER_TARGET),
            target: {
              type: "workspace-file",
              title: "other",
              workspaceRoot: DIRECTORY,
              path: OTHER_TARGET.path,
              absolutePath: `${DIRECTORY}/${OTHER_TARGET.path}`,
              route: "/docs/other.md",
              status: "ready",
            },
            metadata: [],
            content: "other",
            refs: [],
            hints: [],
          },
        }),
        subscribe: () => () => undefined,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      service.setActiveSessionID("session-1")
      const ordinaryPublish = service.publishCurrent()
      await contextPublishStarted

      const completion = service.completeClientAction({
        actionID: "action-1",
        sessionID: "session-1",
        getActiveSessionID: () => "session-1",
        completion: {
          outcome: "committed",
          observedRoute: projection.route,
          observedVisibility: projection.bench.visibility,
          drawer: projection.drawer,
          changed: true,
        },
      })
      projection = projectionFor(OTHER_TARGET)
      releaseContextPublish?.()

      await ordinaryPublish
      await expect(completion).resolves.toBe(true)
      expect(completionBodies).toHaveLength(1)
      expect(completionBodies[0]).toMatchObject({
        observedRoute: { status: "open", target: TARGET },
        context: { status: "open", target: { path: TARGET.path } },
      })
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("uses route fallback when a matching registration returns stale target context", async () => {
    const completionBodies: unknown[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/client-actions/action-stale-context/complete") && method === "POST") {
          completionBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ status: "completed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "PUT" || method === "DELETE") {
          return new Response(JSON.stringify({ revision: 1, released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(RESOURCE_TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: (route) =>
          route.status === "open" && route.target.type === "object"
            ? openObjectFallbackContext(route.target)
            : null,
      })
      service.registerSurface({
        target: RESOURCE_TARGET,
        getSnapshot: () => ({
          target: RESOURCE_TARGET,
          targetKey: benchTargetKey(RESOURCE_TARGET),
          semanticRevision: 2,
          context: {
            ...openSurfaceContext(TARGET),
            target: {
              ...openSurfaceContext(TARGET).target,
              route: `/objects/${RESOURCE_TARGET.ref.kind}/${RESOURCE_TARGET.ref.objectID}?view=${RESOURCE_TARGET.viewID}`,
            },
          },
        }),
        subscribe: () => () => undefined,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })

      await expect(
        service.completeClientAction({
          actionID: "action-stale-context",
          sessionID: "session-1",
          getActiveSessionID: () => "session-1",
          completion: {
            outcome: "committed",
            observedRoute: projectionFor(RESOURCE_TARGET).route,
            observedVisibility: "visible",
            drawer: null,
            changed: true,
          },
        }),
      ).resolves.toBeTrue()

      expect(completionBodies).toHaveLength(1)
      expect(completionBodies[0]).toMatchObject({
        observedRoute: { status: "open", target: RESOURCE_TARGET },
        context: {
          status: "open",
          target: {
            type: "object",
            ref: RESOURCE_TARGET.ref,
            viewID: RESOURCE_TARGET.viewID,
            status: "loading",
          },
        },
      })
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("skips a stale newest registration and uses an older valid registration", async () => {
    const completionBodies: unknown[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (
          url.includes("/bench/client-actions/action-stale-newer-valid-older/complete") &&
          method === "POST"
        ) {
          completionBodies.push(JSON.parse(String(body)))
          return new Response(JSON.stringify({ status: "completed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "PUT" || method === "DELETE") {
          return new Response(JSON.stringify({ revision: 1, released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(RESOURCE_TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: (route) =>
          route.status === "open" && route.target.type === "object"
            ? openObjectFallbackContext(route.target)
            : null,
      })
      service.registerSurface({
        target: RESOURCE_TARGET,
        getSnapshot: () => ({
          target: RESOURCE_TARGET,
          targetKey: benchTargetKey(RESOURCE_TARGET),
          semanticRevision: 3,
          context: openObjectSurfaceContext({
            target: RESOURCE_TARGET,
            content: "older valid surface",
          }),
        }),
        subscribe: () => () => undefined,
      })
      service.registerSurface({
        target: RESOURCE_TARGET,
        getSnapshot: () => ({
          target: RESOURCE_TARGET,
          targetKey: benchTargetKey(RESOURCE_TARGET),
          semanticRevision: 4,
          context: openSurfaceContext(TARGET),
        }),
        subscribe: () => () => undefined,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })

      await expect(
        service.completeClientAction({
          actionID: "action-stale-newer-valid-older",
          sessionID: "session-1",
          getActiveSessionID: () => "session-1",
          completion: {
            outcome: "committed",
            observedRoute: projectionFor(RESOURCE_TARGET).route,
            observedVisibility: "visible",
            drawer: null,
            changed: true,
          },
        }),
      ).resolves.toBeTrue()

      expect(completionBodies).toHaveLength(1)
      expect(completionBodies[0]).toMatchObject({
        observedRoute: { status: "open", target: RESOURCE_TARGET },
        context: {
          status: "open",
          targetKey: benchTargetKey(RESOURCE_TARGET),
          target: {
            type: "object",
            ref: RESOURCE_TARGET.ref,
            viewID: RESOURCE_TARGET.viewID,
            status: "ready",
          },
          metadata: ["provider: live-surface"],
          content: "older valid surface",
        },
      })
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("retries a conflicting completion when the authoritative lease changed", async () => {
    const completionBodies: Array<{ lease?: { generation?: number } }> = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    let service: DirectoryWorkspaceLifecycleService | undefined
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (url.includes("/bench/client-actions/action-lease/complete") && method === "POST") {
          const parsed = JSON.parse(String(body))
          completionBodies.push(parsed)
          if (completionBodies.length === 1) {
            const nextLeaseQuery = service?.beginEventStreamLease()
            service?.acceptLease({
              instanceID: String(nextLeaseQuery?.workspaceInstanceID),
              generation: Number(nextLeaseQuery?.connectionGeneration),
              leaseEpoch: 2,
              directory: DIRECTORY,
            })
            return new Response(JSON.stringify({ status: "conflict" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }
          return new Response(JSON.stringify({ status: "completed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ revision: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })

      await expect(
        service.completeClientAction({
          actionID: "action-lease",
          sessionID: "session-1",
          getActiveSessionID: () => "session-1",
          completion: { outcome: "failed", reason: "navigation_failed" },
        }),
      ).resolves.toBe(true)
      expect(completionBodies.map((body) => body.lease?.generation)).toEqual([1, 2])
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("keeps same-lease conflicts incomplete but treats expiry as terminal", async () => {
    const statuses = ["conflict", "expired"] as const
    let requestIndex = 0
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ status: statuses[requestIndex++] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      const completionInput = {
        sessionID: "session-1",
        getActiveSessionID: () => "session-1",
        completion: { outcome: "failed", reason: "navigation_failed" },
      } as const

      await expect(
        service.completeClientAction({ actionID: "action-conflict", ...completionInput }),
      ).resolves.toBe(false)
      await expect(
        service.completeClientAction({ actionID: "action-expired", ...completionInput }),
      ).resolves.toBe(true)
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("publishes the outgoing session closed before adopting the incoming session", async () => {
    const publications: ContextPublicationProbe[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        const sessionMatch = url.match(/\/bench\/session\/([^/]+)\/context/)
        if (method === "PUT" && sessionMatch && body) {
          const parsed = JSON.parse(String(body))
          publications.push({
            sessionID: decodeURIComponent(String(sessionMatch[1])),
            generation: parsed.lease.generation,
            publicationSequence: parsed.publicationSequence,
            status: parsed.value.status,
          })
          return new Response(JSON.stringify({ revision: publications.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => openSurfaceContext(),
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })

      await service.setActiveSessionID("session-a")
      await service.setActiveSessionID("session-b")

      expect(publications.slice(0, 3)).toEqual([
        { sessionID: "session-a", generation: 1, publicationSequence: 1, status: "open" },
        { sessionID: "session-a", generation: 1, publicationSequence: 2, status: "closed" },
        { sessionID: "session-b", generation: 1, publicationSequence: 1, status: "open" },
      ])
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("does not adopt a superseded intermediate session", async () => {
    const publications: ContextPublicationProbe[] = []
    let markOutgoingCloseStarted: (() => void) | undefined
    let releaseOutgoingClose: (() => void) | undefined
    const outgoingCloseStarted = new Promise<void>((resolve) => {
      markOutgoingCloseStarted = resolve
    })
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        const sessionMatch = url.match(/\/bench\/session\/([^/]+)\/context/)
        if (method === "PUT" && sessionMatch && body) {
          const parsed = JSON.parse(String(body))
          const publication = {
            sessionID: decodeURIComponent(String(sessionMatch[1])),
            generation: parsed.lease.generation,
            publicationSequence: parsed.publicationSequence,
            status: parsed.value.status,
          }
          publications.push(publication)
          if (publication.sessionID === "session-a" && publication.status === "closed") {
            markOutgoingCloseStarted?.()
            await new Promise<void>((resolve) => {
              releaseOutgoingClose = resolve
            })
          }
          return new Response(JSON.stringify({ revision: publications.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => openSurfaceContext(),
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await service.setActiveSessionID("session-a")

      const transitionToB = service.setActiveSessionID("session-b")
      await outgoingCloseStarted
      const transitionToC = service.setActiveSessionID("session-c")
      releaseOutgoingClose?.()
      await Promise.all([transitionToB, transitionToC])

      expect(publications.some((publication) => publication.sessionID === "session-b")).toBeFalse()
      expect(publications.at(-1)).toMatchObject({
        sessionID: "session-c",
        status: "open",
      })
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("republishes unchanged active context with sequence one after reconnect", async () => {
    const publications: ContextPublicationProbe[] = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        if (method === "PUT" && body) {
          const parsed = JSON.parse(String(body))
          publications.push({
            sessionID: "session-a",
            generation: parsed.lease.generation,
            publicationSequence: parsed.publicationSequence,
            status: parsed.value.status,
          })
          return new Response(JSON.stringify({ revision: publications.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => openSurfaceContext(),
      })
      const firstLease = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(firstLease.workspaceInstanceID),
        generation: Number(firstLease.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await service.setActiveSessionID("session-a")

      const secondLease = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(secondLease.workspaceInstanceID),
        generation: Number(secondLease.connectionGeneration),
        leaseEpoch: 2,
        directory: DIRECTORY,
      })
      await service.publishCurrent()

      expect(publications.slice(0, 2)).toEqual([
        { sessionID: "session-a", generation: 1, publicationSequence: 1, status: "open" },
        { sessionID: "session-a", generation: 2, publicationSequence: 1, status: "open" },
      ])
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("rejects a committed completion when its session changes while queued", async () => {
    let activeSessionID = "session-a"
    let markPublishStarted: (() => void) | undefined
    let releasePublish: (() => void) | undefined
    let completionRequests = 0
    let contextPublishCount = 0
    const publishStarted = new Promise<void>((resolve) => {
      markPublishStarted = resolve
    })
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const url = request?.url ?? String(input)
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        if (method === "PUT") {
          contextPublishCount += 1
          if (contextPublishCount === 1) {
            markPublishStarted?.()
            await new Promise<void>((resolve) => {
              releasePublish = resolve
            })
          }
          return new Response(JSON.stringify({ revision: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (url.includes("/complete") && method === "POST") {
          completionRequests += 1
          return new Response(JSON.stringify({ status: "completed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (method === "DELETE") {
          return new Response(JSON.stringify({ released: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ error: { message: "unexpected request" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => openSurfaceContext(),
      })
      await service.setActiveSessionID("session-a")
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      await publishStarted

      const completion = service.completeClientAction({
        actionID: "action-session-switch",
        sessionID: "session-a",
        getActiveSessionID: () => activeSessionID,
        completion: {
          outcome: "committed",
          observedRoute: projectionFor(TARGET).route,
          observedVisibility: "visible",
          drawer: null,
          changed: true,
        },
      })
      activeSessionID = "session-b"
      releasePublish?.()

      await expect(completion).resolves.toBeFalse()
      expect(completionRequests).toBe(0)
      await service.dispose()
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("publishes closed context before releasing the lease on disposal", async () => {
    const requests: Array<{ method: string; value?: unknown }> = []
    setRuntimeServerConnection({ url: "http://buddy.test", isSidecar: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
        const body = init?.body ?? (request ? await request.clone().text() : undefined)
        const parsedBody = body ? JSON.parse(String(body)) : undefined
        requests.push({ method, ...(parsedBody ? { value: parsedBody.value } : {}) })
        return new Response(
          JSON.stringify(method === "DELETE" ? { released: true } : { revision: 1 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      },
      { preconnect: () => undefined },
    )

    try {
      const service = new DirectoryWorkspaceLifecycleService({
        directory: DIRECTORY,
        getProjection: () => projectionFor(TARGET),
        getHydrationStatus: () => "ready",
        getRouteFallbackContext: () => null,
      })
      const leaseQuery = service.beginEventStreamLease()
      service.acceptLease({
        instanceID: String(leaseQuery.workspaceInstanceID),
        generation: Number(leaseQuery.connectionGeneration),
        leaseEpoch: 1,
        directory: DIRECTORY,
      })
      service.setActiveSessionID("session-1")

      await service.dispose()

      expect(requests).toEqual([
        { method: "PUT", value: { status: "closed" } },
        { method: "DELETE" },
      ])
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
