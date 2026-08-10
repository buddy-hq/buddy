import { afterEach, describe, expect, test } from "bun:test"
import {
  benchTargetKey,
  clearBenchContextRegistry,
  type BenchTarget,
} from "../../src/learning/features/bench/context"
import {
  BenchClientActionBroker,
  SSE_EVENT_TYPE_CLIENT_ACTION,
  type BenchBrokerClock,
  type BenchClientAction,
  type BenchClientActionCompletion,
  type BenchClientLease,
} from "../../src/learning/features/bench/client-actions"

const DIRECTORY = "/tmp/buddy-bench-broker"
const SESSION_ID = "session-broker"
const OTHER_SESSION_ID = "session-other"
const INSTANCE_ID = "broker-client"
const ACTION_TIMEOUT_MS = 30_000
const RESOURCE_OBJECT_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BD"
const RESOURCE_REVISION_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BE"

type FakeTimer = {
  id: number
  at: number
  active: boolean
  callback: () => void
}

class FakeBenchBrokerClock implements BenchBrokerClock {
  #now = 0
  #timerID = 0
  #timers: FakeTimer[] = []

  now(): number {
    return this.#now
  }

  setTimeout(callback: () => void, delayMs: number): () => void {
    this.#timerID += 1
    const timer = {
      id: this.#timerID,
      at: this.#now + delayMs,
      active: true,
      callback,
    }
    this.#timers.push(timer)
    return () => {
      timer.active = false
    }
  }

  clearTimeout(timer: () => void): void {
    timer()
  }

  advance(ms: number): void {
    this.#now += ms
    while (true) {
      const timer = this.#timers
        .filter((entry) => entry.active && entry.at <= this.#now)
        .toSorted((left, right) => left.at - right.at || left.id - right.id)[0]
      if (!timer) return
      timer.active = false
      timer.callback()
    }
  }
}

afterEach(() => {
  clearBenchContextRegistry()
})

function createBroker() {
  const clock = new FakeBenchBrokerClock()
  return {
    clock,
    broker: new BenchClientActionBroker({ clock }),
  }
}

function connectClient(input: { broker: BenchClientActionBroker; generation?: number }) {
  const lease = input.broker.connectLease({
    directory: DIRECTORY,
    instanceID: INSTANCE_ID,
    generation: input.generation ?? 1,
  })
  const actions: BenchClientAction[] = []
  const unsubscribe = input.broker.subscribe({
    directory: DIRECTORY,
    lease,
    listener(event) {
      if (event.payload.type === SSE_EVENT_TYPE_CLIENT_ACTION) {
        actions.push(event.payload.properties.action)
      }
    },
  })
  return {
    lease,
    actions,
    unsubscribe,
  }
}

function enqueuePresentAction(broker: BenchClientActionBroker, input?: { sessionID?: string }) {
  return broker.enqueueRequiredAction({
    directory: DIRECTORY,
    sessionID: input?.sessionID ?? SESSION_ID,
    messageID: "msg_broker",
    callID: null,
    command: {
      type: "present",
      autoOpen: null,
      target: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
      },
    },
  })
}

function enqueueResourceAction(broker: BenchClientActionBroker) {
  return broker.enqueueRequiredAction({
    directory: DIRECTORY,
    sessionID: SESSION_ID,
    messageID: "msg_resource",
    callID: null,
    command: {
      type: "present",
      autoOpen: null,
      target: {
        type: "object",
        ref: {
          kind: "resource",
          objectID: RESOURCE_OBJECT_ID,
          revisionID: RESOURCE_REVISION_ID,
          itemID: null,
        },
        viewID: "reader",
      },
    },
  })
}

function committedCompletion(input: {
  lease: BenchClientLease
  action: BenchClientAction
  publicationSequence?: number
  changed?: boolean
}): BenchClientActionCompletion {
  if (input.action.command.type !== "present") {
    throw new Error("Expected present action.")
  }
  return {
    outcome: "committed",
    lease: {
      instanceID: input.lease.instanceID,
      generation: input.lease.generation,
      leaseEpoch: input.lease.leaseEpoch,
    },
    publicationSequence: input.publicationSequence ?? 1,
    observedRoute: {
      status: "open",
      target: input.action.command.target,
      mode: "docked",
    },
    observedVisibility: "visible",
    drawer: null,
    context: {
      status: "open",
      visibility: "visible",
      mode: "docked",
      selectedTabKey: "file:markdown:notes.md",
      tabs: [
        {
          tabKey: "file:markdown:notes.md",
          title: "notes.md",
          target: input.action.command.target,
        },
      ],
      targetKey: benchTargetKey(input.action.command.target),
      target: {
        type: "workspace-file",
        title: "notes.md",
        workspaceRoot: DIRECTORY,
        path: "notes.md",
        absolutePath: `${DIRECTORY}/notes.md`,
        route: "/_bench/markdown?path=notes.md",
        status: "ready",
      },
      drawer: null,
      metadata: [],
      content: "Snapshot",
      refs: [],
      hints: [],
    },
    changed: input.changed ?? true,
  }
}

function committedResourceCompletion(input: {
  lease: BenchClientLease
  action: BenchClientAction
  contextRevisionID: string | null
}): BenchClientActionCompletion {
  if (input.action.command.type !== "present" || input.action.command.target.type !== "object") {
    throw new Error("Expected resource present action.")
  }
  const contextTarget = {
    type: "object",
    ref: {
      ...input.action.command.target.ref,
      revisionID: input.contextRevisionID,
    },
    viewID: input.action.command.target.viewID,
  } satisfies BenchTarget
  return {
    outcome: "committed",
    lease: {
      instanceID: input.lease.instanceID,
      generation: input.lease.generation,
      leaseEpoch: input.lease.leaseEpoch,
    },
    publicationSequence: 1,
    observedRoute: {
      status: "open",
      target: input.action.command.target,
      mode: "docked",
    },
    observedVisibility: "visible",
    drawer: null,
    context: {
      status: "open",
      visibility: "visible",
      mode: "docked",
      selectedTabKey: `object:resource:${RESOURCE_OBJECT_ID}:reader`,
      tabs: [
        {
          tabKey: `object:resource:${RESOURCE_OBJECT_ID}:reader`,
          title: "Book",
          target: input.action.command.target,
        },
      ],
      targetKey: benchTargetKey(contextTarget),
      target: {
        type: "object",
        title: "Book",
        workspaceRoot: DIRECTORY,
        ref: contextTarget.ref,
        viewID: contextTarget.viewID,
        route: "/_bench/objects/resource/book?view=reader",
        status: "ready",
      },
      drawer: null,
      metadata: [],
      content: "Book snapshot",
      refs: [],
      hints: [],
    },
    changed: true,
  }
}

function capturedCompletion(input: {
  lease: BenchClientLease
  action: BenchClientAction
  drawer: "files" | "skills"
}): BenchClientActionCompletion {
  if (input.action.command.type !== "capture_bench_screenshot") {
    throw new Error("Expected capture action.")
  }
  return {
    outcome: "captured",
    lease: {
      instanceID: input.lease.instanceID,
      generation: input.lease.generation,
      leaseEpoch: input.lease.leaseEpoch,
    },
    publicationSequence: 1,
    observedRoute: {
      status: "open",
      target: input.action.command.target,
      mode: "docked",
    },
    observedVisibility: "visible",
    drawer: input.drawer,
    context: {
      status: "open",
      visibility: "visible",
      mode: "docked",
      selectedTabKey: input.action.command.tabKey,
      tabs: [
        {
          tabKey: input.action.command.tabKey,
          title: "notes.md",
          target: input.action.command.target,
        },
      ],
      targetKey: benchTargetKey(input.action.command.target),
      target: {
        type: "workspace-file",
        title: "notes.md",
        workspaceRoot: DIRECTORY,
        path: "notes.md",
        absolutePath: `${DIRECTORY}/notes.md`,
        route: "/_bench/markdown?path=notes.md",
        status: "ready",
      },
      drawer: { kind: input.drawer, presentation: "drawer" },
      metadata: [],
      content: "Snapshot",
      refs: [],
      hints: [],
    },
    pngBase64: "png-bytes",
  }
}

describe("BenchClientActionBroker", () => {
  test("redelivers uncompleted required actions after reconnect", () => {
    const { broker } = createBroker()
    const enqueued = enqueuePresentAction(broker)

    const firstClient = connectClient({ broker, generation: 1 })
    expect(firstClient.actions.map((action) => action.actionID)).toEqual([enqueued.action.actionID])
    firstClient.unsubscribe()

    const secondClient = connectClient({ broker, generation: 2 })
    expect(secondClient.actions.map((action) => action.actionID)).toEqual([
      enqueued.action.actionID,
    ])
  })

  test("expires undelivered actions as no-client failures", async () => {
    const { broker, clock } = createBroker()
    const enqueued = enqueuePresentAction(broker)

    clock.advance(ACTION_TIMEOUT_MS)

    await expect(enqueued.completion).resolves.toEqual({
      status: "expired",
      delivered: false,
    })
  })

  test("expires delivered actions as client-timeout failures", async () => {
    const { broker, clock } = createBroker()
    connectClient({ broker })
    const enqueued = enqueuePresentAction(broker)

    clock.advance(ACTION_TIMEOUT_MS)

    await expect(enqueued.completion).resolves.toEqual({
      status: "expired",
      delivered: true,
    })
  })

  test("delivers required actions to the authoritative directory lease regardless of action session", async () => {
    const { broker } = createBroker()
    const client = connectClient({ broker })
    const enqueued = enqueuePresentAction(broker, { sessionID: OTHER_SESSION_ID })
    const action = client.actions[0]
    if (!action) throw new Error("Expected delivered action.")

    expect(action).toMatchObject({
      actionID: enqueued.action.actionID,
      sessionID: OTHER_SESSION_ID,
    })
    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: committedCompletion({ lease: client.lease, action }),
      }),
    ).toEqual({
      status: "completed",
    })
    await expect(enqueued.completion).resolves.toMatchObject({
      status: "completed",
    })
  })

  test("returns stable duplicate and conflicting completion responses", async () => {
    const { broker } = createBroker()
    const client = connectClient({ broker })
    const enqueued = enqueuePresentAction(broker)
    const action = client.actions[0]
    if (!action) throw new Error("Expected delivered action.")
    const completion = committedCompletion({ lease: client.lease, action })

    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion,
      }),
    ).toEqual({ status: "completed" })
    await expect(enqueued.completion).resolves.toMatchObject({
      status: "completed",
      completion,
    })
    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion,
      }),
    ).toEqual({ status: "already_completed" })
    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: committedCompletion({
          lease: client.lease,
          action,
          publicationSequence: 2,
        }),
      }),
    ).toEqual({ status: "conflict" })
  })

  test("rejects same-path file completions whose context target key uses markdown identity", () => {
    const { broker } = createBroker()
    const client = connectClient({ broker })
    const enqueued = broker.enqueueRequiredAction({
      directory: DIRECTORY,
      sessionID: SESSION_ID,
      messageID: "msg_file_viewer",
      callID: null,
      command: {
        type: "present",
        autoOpen: null,
        target: {
          type: "workspace-file",
          path: "notes.md",
          viewer: "file",
        },
      },
    })
    const action = client.actions[0]
    if (!action) throw new Error("Expected delivered action.")
    const completion = committedCompletion({ lease: client.lease, action })
    if (
      completion.outcome !== "committed" ||
      completion.context.status !== "open" ||
      completion.context.visibility !== "visible"
    ) {
      throw new Error("Expected committed open completion.")
    }

    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: {
          ...completion,
          context: {
            ...completion.context,
            targetKey: benchTargetKey({
              type: "workspace-file",
              path: "notes.md",
              viewer: "markdown",
            }),
          },
        },
      }),
    ).toEqual({ status: "conflict" })
    expect(enqueued.action.actionID).toBe(action.actionID)
  })

  test("rejects resource completions whose synchronized context drops requested revision identity", async () => {
    const { broker } = createBroker()
    const client = connectClient({ broker })
    const enqueued = enqueueResourceAction(broker)
    const action = client.actions[0]
    if (!action) throw new Error("Expected delivered action.")

    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: committedResourceCompletion({
          lease: client.lease,
          action,
          contextRevisionID: null,
        }),
      }),
    ).toEqual({ status: "conflict" })
    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: committedResourceCompletion({
          lease: client.lease,
          action,
          contextRevisionID: RESOURCE_REVISION_ID,
        }),
      }),
    ).toEqual({ status: "completed" })
    expect(enqueued.action.actionID).toBe(action.actionID)
    await expect(enqueued.completion).resolves.toMatchObject({
      status: "completed",
    })
  })

  test("rejects captures whose acknowledged drawer differs from the request", async () => {
    const { broker } = createBroker()
    const client = connectClient({ broker })
    const target = {
      type: "workspace-file",
      path: "notes.md",
      viewer: "markdown",
    } satisfies BenchTarget
    const enqueued = broker.enqueueRequiredAction({
      directory: DIRECTORY,
      sessionID: SESSION_ID,
      messageID: "msg_capture_drawer",
      callID: null,
      command: {
        type: "capture_bench_screenshot",
        tabKey: "file:markdown:notes.md",
        target,
        drawer: "skills",
      },
    })
    const action = client.actions[0]
    if (!action) throw new Error("Expected delivered capture action.")

    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: capturedCompletion({ lease: client.lease, action, drawer: "files" }),
      }),
    ).toEqual({ status: "conflict" })
    expect(
      broker.completeAction({
        directory: DIRECTORY,
        actionID: action.actionID,
        completion: capturedCompletion({ lease: client.lease, action, drawer: "skills" }),
      }),
    ).toEqual({ status: "completed" })
    await expect(enqueued.completion).resolves.toMatchObject({ status: "completed" })
  })
})
