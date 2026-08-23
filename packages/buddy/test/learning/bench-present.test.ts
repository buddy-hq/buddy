import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, test } from "bun:test"
import { resolveToolPresentationSnapshot } from "@buddy/opencode-adapter/tool-presentation"
import {
  benchTargetKey,
  clearBenchContextRegistry,
  publishSequencedBenchContext,
  type BenchContextTarget,
  type BenchTarget,
} from "../../src/learning/features/bench/context"
import "../../src/learning/features"
import {
  SSE_EVENT_TYPE_CLIENT_ACTION,
  benchClientActionBroker,
  type BenchClientAction,
  type BenchClientLease,
} from "../../src/learning/features/bench/client-actions"
import { benchPresentTool, presentOnBench } from "../../src/learning/features/bench/tools/present"
import { BUDDY_OBJECT_KIND_VALUES, getBuddyObjectKindDefinition } from "../../src/objects"
import {
  addResource,
  resolveResourceObjectByKey,
} from "../../src/resources/resource-registry-service"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"
import { createTestPdf } from "../helpers/pdf"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"

type TBuddyToolMetadataUpdate = Parameters<BuddyToolContext["metadata"]>[0]

const SESSION_ID = "session-bench-present"
const TEST_CLIENT_INSTANCE_ID = "test-bench-client"

afterEach(() => {
  clearBenchContextRegistry()
  benchClientActionBroker.reset()
})

type TestBenchClient = {
  directory: string
  lease: BenchClientLease
  actions: BenchClientAction[]
  publicationSequence: number
  unsubscribe: () => void
}

function connectTestBenchClient(input: { directory: string }): TestBenchClient {
  const lease = benchClientActionBroker.connectLease({
    directory: input.directory,
    instanceID: TEST_CLIENT_INSTANCE_ID,
    generation: 1,
  })
  const actions: BenchClientAction[] = []
  const unsubscribe = benchClientActionBroker.subscribe({
    directory: input.directory,
    lease,
    listener(event) {
      if (event.payload.type === SSE_EVENT_TYPE_CLIENT_ACTION) {
        actions.push(event.payload.properties.action)
      }
    },
  })
  return {
    directory: input.directory,
    lease,
    actions,
    publicationSequence: 0,
    unsubscribe,
  }
}

async function readNextAction(client: TestBenchClient): Promise<BenchClientAction> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const action = client.actions.shift()
    if (action) return action
    await sleep(0)
  }
  throw new Error("Expected a Bench client action.")
}

function nextPublicationSequence(client: TestBenchClient): number {
  client.publicationSequence += 1
  return client.publicationSequence
}

function leaseIdentity(lease: BenchClientLease) {
  return {
    instanceID: lease.instanceID,
    generation: lease.generation,
    leaseEpoch: lease.leaseEpoch,
  }
}

function openContextForAction(input: {
  directory: string
  action: BenchClientAction
  status?: BenchContextTarget["status"]
  content?: string
}) {
  if (
    input.action.command.type === "close" ||
    input.action.command.type === "capture_bench_screenshot"
  ) {
    return { status: "closed" as const }
  }
  const target = input.action.command.target
  if (target.type === "workspace-file") {
    return {
      status: "open" as const,
      visibility: "visible" as const,
      mode: "docked" as const,
      selectedTabKey: `file:${target.viewer}:${encodeURIComponent(target.path)}`,
      tabs: [
        {
          tabKey: `file:${target.viewer}:${encodeURIComponent(target.path)}`,
          title: path.basename(target.path),
          target,
        },
      ],
      targetKey: benchTargetKey(target),
      target: {
        type: "workspace-file" as const,
        title: path.basename(target.path),
        workspaceRoot: input.directory,
        path: target.path,
        absolutePath: path.join(input.directory, target.path),
        route: `/_bench/${target.viewer === "markdown" ? "markdown" : "file"}?path=${encodeURIComponent(target.path)}`,
        status: input.status ?? "ready",
      },
      drawer: null,
      metadata: ["dirty: false", "save_state: ready"],
      content: input.content ?? "Current Bench snapshot.",
      refs: [
        {
          kind: "file" as const,
          value: target.path,
          note: "File on Bench.",
        },
      ],
      hints: [],
    }
  }
  return {
    status: "open" as const,
    visibility: "visible" as const,
    mode: "docked" as const,
    selectedTabKey: `object:${target.ref.kind}:${encodeURIComponent(target.ref.objectID)}:${encodeURIComponent(target.viewID)}`,
    tabs: [
      {
        tabKey: `object:${target.ref.kind}:${encodeURIComponent(target.ref.objectID)}:${encodeURIComponent(target.viewID)}`,
        title: "Bench object",
        target,
      },
    ],
    targetKey: benchTargetKey(target),
    target: {
      type: "object" as const,
      title: "Bench object",
      workspaceRoot: input.directory,
      ref: target.ref,
      viewID: target.viewID,
      route: `/_bench/objects/${target.ref.kind}/${target.ref.objectID}?view=${encodeURIComponent(target.viewID)}`,
      status: input.status ?? "ready",
    },
    drawer: null,
    metadata: [],
    content: input.content ?? "Current Bench object snapshot.",
    refs: [
      {
        kind: "object" as const,
        value: target.ref.objectID,
        note: "Object on Bench.",
      },
    ],
    hints: [],
  }
}

function completeCommittedAction(input: {
  client: TestBenchClient
  action: BenchClientAction
  changed: boolean
  contextStatus?: BenchContextTarget["status"]
  contextContent?: string
}) {
  const completion =
    input.action.command.type === "close"
      ? {
          outcome: "committed" as const,
          lease: leaseIdentity(input.client.lease),
          publicationSequence: nextPublicationSequence(input.client),
          observedRoute: { status: "closed" as const },
          observedVisibility: "closed" as const,
          drawer: null,
          context: { status: "closed" as const },
          changed: input.changed,
        }
      : {
          outcome: "committed" as const,
          lease: leaseIdentity(input.client.lease),
          publicationSequence: nextPublicationSequence(input.client),
          observedRoute: {
            status: "open" as const,
            target: input.action.command.target,
            mode: "docked" as const,
          },
          observedVisibility: "visible" as const,
          drawer: null,
          context: openContextForAction(
            Object.assign(
              {
                directory: input.client.directory,
                action: input.action,
              },
              input.contextStatus ? { status: input.contextStatus } : undefined,
              input.contextContent ? { content: input.contextContent } : undefined,
            ),
          ),
          changed: input.changed,
        }
  return benchClientActionBroker.completeAction({
    directory: input.client.directory,
    actionID: input.action.actionID,
    completion,
  })
}

function publishActionContext(input: {
  client: TestBenchClient
  action: BenchClientAction
  status: BenchContextTarget["status"]
  content: string
}) {
  return publishSequencedBenchContext({
    directory: input.client.directory,
    sessionID: input.action.sessionID,
    body: {
      lease: leaseIdentity(input.client.lease),
      publicationSequence: nextPublicationSequence(input.client),
      idempotencyKey: `${input.action.actionID}:${input.status}`,
      value: openContextForAction({
        directory: input.client.directory,
        action: input.action,
        status: input.status,
        content: input.content,
      }),
    },
  })
}

function completeBlockedAction(input: { client: TestBenchClient; action: BenchClientAction }) {
  return benchClientActionBroker.completeAction({
    directory: input.client.directory,
    actionID: input.action.actionID,
    completion: {
      outcome: "blocked",
      lease: leaseIdentity(input.client.lease),
      reason: "leave_guard_blocked",
    },
  })
}

function completeSupersededAction(input: {
  client: TestBenchClient
  action: BenchClientAction
  observedTarget: BenchTarget
}) {
  return benchClientActionBroker.completeAction({
    directory: input.client.directory,
    actionID: input.action.actionID,
    completion: {
      outcome: "superseded",
      lease: leaseIdentity(input.client.lease),
      reason: "newer_command",
      observedRoute: {
        status: "open",
        target: input.observedTarget,
        mode: "docked",
      },
      observedVisibility: "visible",
      drawer: null,
    },
  })
}

function presentOnBenchWithTestContext(
  input: Omit<
    Parameters<typeof presentOnBench>[0],
    "messageID" | "callID" | "abort" | "ask" | "tabKey"
  >,
) {
  return presentOnBench({
    ...input,
    tabKey: null,
    messageID: "msg_bench_present_test",
    callID: null,
    abort: new AbortController().signal,
    ask: async () => undefined,
  })
}

async function waitForResourceReader(input: {
  directory: string
  resourceKey: string
}): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const resource = await resolveResourceObjectByKey({
      directory: input.directory,
      resourceKey: input.resourceKey,
    }).catch(() => undefined)
    if (resource?.readerPath) return
    await sleep(100)
  }
  throw new Error(`Expected resource ${input.resourceKey} to expose a reader path.`)
}

describe("bench_present", () => {
  test("has a registered Bench resolver for every Buddy object kind", () => {
    expect(
      BUDDY_OBJECT_KIND_VALUES.filter(
        (kind) => getBuddyObjectKindDefinition(kind)?.resolveBenchView === undefined,
      ),
    ).toEqual([])
  })

  test("accepts omitted inactive fields for close", async () => {
    await using project = await tmpdir({ git: true })
    const client = connectTestBenchClient({ directory: project.path })

    const run = benchPresentTool.run(
      {
        action: "close",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_bench_present_omitted_nulls",
        agent: "buddy",
      }),
    )
    const action = await readNextAction(client)
    expect(action.command).toEqual({ type: "close" })
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    expect(result.output).toBe("Requested closing Bench.")
    expect(result.metadata).toMatchObject({
      benchAction: "close",
      benchStatus: "closed",
      reason: "closed_by_request",
      benchTarget: null,
    })
  })

  test("focuses an exact synchronized tab key without resolving a new target", async () => {
    await using project = await tmpdir({ git: true })
    const client = connectTestBenchClient({ directory: project.path })
    const selectedTarget = {
      type: "workspace-file",
      path: "selected.md",
      viewer: "markdown",
    } satisfies BenchTarget
    const backgroundTarget = {
      type: "workspace-file",
      path: "background.md",
      viewer: "markdown",
    } satisfies BenchTarget
    const contextAction = {
      version: 2,
      actionID: "context-action",
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "context-message",
      callID: null,
      origin: "agent",
      acknowledgement: "required",
      expiresAt: Date.now() + 30_000,
      command: { type: "present", target: selectedTarget, autoOpen: null },
    } satisfies BenchClientAction
    const initialContext = openContextForAction({
      directory: project.path,
      action: contextAction,
    })
    if (initialContext.status !== "open") throw new Error("Expected open context.")
    const backgroundTabKey = `file:markdown:${encodeURIComponent(backgroundTarget.path)}`
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: leaseIdentity(client.lease),
        publicationSequence: nextPublicationSequence(client),
        idempotencyKey: "focus-tab-context",
        value: {
          ...initialContext,
          tabs: [
            ...initialContext.tabs,
            { tabKey: backgroundTabKey, title: "background.md", target: backgroundTarget },
          ],
        },
      },
    })

    const run = presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "focus-message",
      callID: null,
      abort: new AbortController().signal,
      action: "focus_tab",
      path: null,
      resourceKey: null,
      objectID: null,
      tabKey: backgroundTabKey,
      ask: async () => undefined,
    })
    const action = await readNextAction(client)
    expect(action.command).toEqual({
      type: "focus_tab",
      tabKey: backgroundTabKey,
      target: backgroundTarget,
    })
    completeCommittedAction({ client, action, changed: true })

    await expect(run).resolves.toMatchObject({
      status: "presented",
      reason: "focused_tab",
      benchTarget: backgroundTarget,
    })
  })

  test("rejects a stale focus tab key with a re-read instruction", async () => {
    await using project = await tmpdir({ git: true })
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: { instanceID: "focus-stale", generation: 1, leaseEpoch: 1 },
        publicationSequence: 1,
        idempotencyKey: "focus-stale-context",
        value: { status: "closed" },
      },
    })

    await expect(
      presentOnBench({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "focus-stale-message",
        callID: null,
        abort: new AbortController().signal,
        action: "focus_tab",
        path: null,
        resourceKey: null,
        objectID: null,
        tabKey: "file:markdown:missing.md",
        ask: async () => undefined,
      }),
    ).resolves.toMatchObject({
      status: "error",
      reason: "tab_not_found",
      message: expect.stringContaining("bench_read_context"),
    })
  })

  test("rejects unknown fields instead of silently discarding them", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      benchPresentTool.run(
        {
          action: "close",
          route: "/_bench/file",
        },
        createBuddyToolContext({
          directory: project.path,
          sessionID: SESSION_ID,
          messageID: "msg_bench_present_unknown_field",
          agent: "buddy",
        }),
      ),
    ).rejects.toThrow("Unrecognized key")
  })

  test("presents an existing workspace file when Bench is synchronized closed", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeCommittedAction({
      client,
      action,
      changed: true,
      contextStatus: "loading",
      contextContent: "Markdown Bench is loading.",
    })
    publishActionContext({
      client,
      action,
      status: "ready",
      content: "Markdown Bench is ready.",
    })
    const result = await run

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_file",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
      },
    })
  })

  test("returns the existing Bench surface error after a loading presentation settles", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "broken.mdx"), "# Broken\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const metadataUpdates: TBuddyToolMetadataUpdate[] = []
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "msg_bench_present_surface_error",
      agent: "buddy",
    })
    const run = benchPresentTool.run(
      {
        action: "present_file",
        path: "broken.mdx",
      },
      {
        ...context,
        metadata(input) {
          metadataUpdates.push(input)
          return Promise.resolve()
        },
      },
    )
    const action = await readNextAction(client)
    completeCommittedAction({
      client,
      action,
      changed: true,
      contextStatus: "loading",
      contextContent: "Markdown Bench is loading.",
    })
    publishActionContext({
      client,
      action,
      status: "error",
      content: "The Markdown file could not be rendered: Unexpected empty expression.",
    })

    await expect(run).rejects.toThrow("Unexpected empty expression")
    expect(metadataUpdates).toEqual([
      {
        title: "Bench Presentation",
        metadata: {
          benchAction: "present_file",
          benchStatus: "error",
          reason: "surface_error",
          benchTarget: {
            type: "workspace-file",
            path: "broken.mdx",
            viewer: "markdown",
          },
        },
      },
    ])
  })

  test("returns blocked presentations as failed tool calls", async () => {
    await using project = await tmpdir()
    const metadataUpdates: TBuddyToolMetadataUpdate[] = []
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "msg_bench_present_missing_file",
      agent: "buddy",
    })

    const run = benchPresentTool.run(
      {
        action: "present_file",
        path: "missing.md",
      },
      {
        ...context,
        metadata(input) {
          metadataUpdates.push(input)
          return Promise.resolve()
        },
      },
    )

    await expect(run).rejects.toThrow("File not found")
    expect(metadataUpdates).toEqual([
      {
        title: "Bench Presentation",
        metadata: {
          benchAction: "present_file",
          benchStatus: "blocked",
          reason: "file_not_found",
          benchTarget: null,
        },
      },
    ])
  })

  test("preserves successful surface metadata in a completed tool result", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "ready.md"), "# Ready\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = benchPresentTool.run(
      {
        action: "present_file",
        path: "ready.md",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_bench_present_ready",
        agent: "buddy",
      }),
    )
    const action = await readNextAction(client)
    completeCommittedAction({
      client,
      action,
      changed: true,
      contextStatus: "ready",
      contextContent: "Ready.",
    })

    await expect(run).resolves.toMatchObject({
      metadata: {
        benchAction: "present_file",
        benchStatus: "presented",
        benchTarget: {
          type: "workspace-file",
          path: "ready.md",
          viewer: "markdown",
        },
      },
    })
  })

  test("returns a timeout error when the existing Bench status remains loading", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "slow.md"), "# Slow\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBench({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "msg_bench_present_surface_timeout",
      callID: null,
      abort: new AbortController().signal,
      action: "present_file",
      path: "slow.md",
      resourceKey: null,
      objectID: null,
      tabKey: null,
      ask: async () => undefined,
      presentationSettleTimeoutMs: 0,
    })
    const action = await readNextAction(client)
    completeCommittedAction({
      client,
      action,
      changed: true,
      contextStatus: "loading",
      contextContent: "Markdown Bench is still loading.",
    })

    await expect(run).resolves.toMatchObject({
      status: "error",
      reason: "surface_timeout",
      message: expect.stringContaining("did not finish loading"),
    })
  })

  test("presents MDX workspace files on the Markdown Bench", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "lesson.mdx"), "# Lesson\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "lesson.mdx",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_file",
      benchTarget: {
        type: "workspace-file",
        path: "lesson.mdx",
        viewer: "markdown",
      },
    })
  })

  test("accepts an absolute path inside the workspace without external permission", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })
    const requests: Parameters<ReturnType<typeof createBuddyToolContext>["ask"]>[0][] = []
    const client = connectTestBenchClient({ directory: project.path })
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "msg_bench_present_absolute_workspace",
      agent: "buddy",
    })
    context.ask = async (request) => {
      requests.push(request)
    }

    const run = benchPresentTool.run(
      {
        action: "present_file",
        path: path.join(project.path, "notes.md"),
      },
      context,
    )
    const action = await readNextAction(client)
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    expect(requests).toEqual([])
    expect(result.metadata).toMatchObject({
      benchStatus: "presented",
      reason: "presented_file",
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
      },
    })
  })

  test("authorizes and resolves an external absolute path through an object target", async () => {
    await using project = await tmpdir({ git: true })
    await using external = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "diagram.svg"), "<svg></svg>")
      },
    })
    const externalPath = path.join(external.path, "diagram.svg")
    const lexicalExternalPath = path.resolve(externalPath)
    const canonicalExternalPath = await fs.realpath(externalPath)
    const requests: Parameters<ReturnType<typeof createBuddyToolContext>["ask"]>[0][] = []
    const client = connectTestBenchClient({ directory: project.path })
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: SESSION_ID,
      messageID: "msg_bench_present_absolute_external",
      agent: "buddy",
    })
    context.ask = async (request) => {
      requests.push(request)
    }

    const run = benchPresentTool.run(
      {
        action: "present_file",
        path: externalPath,
      },
      context,
    )
    const action = await readNextAction(client)
    expect(action.command).toMatchObject({
      type: "present",
      target: {
        type: "object",
        ref: { kind: "media-presentation" },
        viewID: "gallery",
      },
    })
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    const expectedAuthorizedPaths =
      lexicalExternalPath === canonicalExternalPath
        ? [canonicalExternalPath]
        : [lexicalExternalPath, canonicalExternalPath]
    expect(requests).toHaveLength(expectedAuthorizedPaths.length)
    expect(
      requests.map((request) => ({
        permission: request.permission,
        patterns: request.patterns,
        metadata: request.metadata,
      })),
    ).toEqual(
      expectedAuthorizedPaths.map((authorizedPath) => ({
        permission: "external_directory",
        patterns: [path.join(path.dirname(authorizedPath), "*")],
        metadata: {
          filepath: authorizedPath,
          parentDir: path.dirname(authorizedPath),
        },
      })),
    )
    expect(result.metadata).toMatchObject({
      benchStatus: "presented",
      reason: "presented_file",
      benchTarget: {
        type: "object",
        ref: { kind: "media-presentation" },
        viewID: "gallery",
      },
      buddyObjectResult: {
        primaryRef: { kind: "media-presentation" },
        presentations: [{ surface: "bench", viewID: "gallery" }],
      },
    })
  })

  test("blocks HTML files so widgets use present_html_widget instead", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "widget.html"), "<button>Start</button>")
      },
    })
    const result = await presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "widget.html",
      resourceKey: null,
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
    })
    expect(result.message).toContain("present_html_widget")
  })

  test("dispatches without a synchronized Bench context preflight", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })

    const client = connectTestBenchClient({ directory: project.path })
    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_file",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
    })
  })

  test("reports already_presenting for the active target", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeCommittedAction({ client, action, changed: false })
    const result = await run

    expect(result).toMatchObject({
      status: "already_presenting",
      reason: "already_showing_target",
      target: {
        type: "workspace-file",
        path: "notes.md",
      },
      benchTarget: {
        type: "workspace-file",
        path: "notes.md",
        viewer: "markdown",
      },
    })
  })

  test("reports observed Bench state when an explicit presentation is replaced", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
        await fs.writeFile(path.join(directory, "other.md"), "# Other\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })
    const observedTarget = {
      type: "workspace-file",
      path: "other.md",
      viewer: "markdown",
    } satisfies BenchTarget

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "notes.md",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeSupersededAction({ client, action, observedTarget })
    const result = await run

    expect(result).toMatchObject({
      status: "error",
      reason: "action_superseded",
      target: null,
      benchTarget: null,
    })
    expect(result.message).toContain("replaced before completion")
    expect(result.message).toContain("other.md")
    expect(result.message).toContain("bench_read_context")
  })

  test("blocks replacing dirty markdown from the synchronized bench snapshot", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "notes.md"), "# Notes\n")
        await fs.writeFile(path.join(directory, "other.txt"), "Other\n")
      },
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_file",
      path: "other.txt",
      resourceKey: null,
      objectID: null,
    })
    const action = await readNextAction(client)
    completeBlockedAction({ client, action })
    const result = await run

    expect(result).toMatchObject({
      status: "blocked",
      reason: "blocked_by_unsaved_work",
    })
  })

  test("presents a resource using the original PDF source path", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "original.pdf"), createTestPdf())
        await addResource({
          directory,
          sourcePath: "original.pdf",
          alias: "book",
        })
      },
    })
    await waitForResourceReader({
      directory: project.path,
      resourceKey: "book",
    })
    const client = connectTestBenchClient({ directory: project.path })

    const run = presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "book",
      objectID: null,
    })
    const action = await readNextAction(client)
    completeCommittedAction({ client, action, changed: true })
    const result = await run

    expect(result).toMatchObject({
      status: "presented",
      reason: "presented_resource",
      target: {
        type: "object",
        viewID: "reader",
      },
      benchTarget: {
        type: "object",
        viewID: "reader",
      },
    })
  })

  test("blocks a reader source that becomes invalid before Bench presentation", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "original.pdf"), createTestPdf())
        await addResource({
          directory,
          sourcePath: "original.pdf",
          alias: "book",
        })
      },
    })
    await waitForResourceReader({
      directory: project.path,
      resourceKey: "book",
    })
    await fs.writeFile(
      path.join(project.path, "original.pdf"),
      "<!DOCTYPE html><html><body>expired download</body></html>",
    )

    const result = await presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "book",
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
      benchTarget: null,
    })
    expect(result.message).toContain("reader source is invalid")
  })

  test("blocks text-only resources instead of presenting internal full text to reading mode", async () => {
    await using project = await tmpdir({
      init: async (directory) => {
        await fs.writeFile(path.join(directory, "essay.txt"), "Self-Reliance\n")
        await addResource({
          directory,
          sourcePath: "essay.txt",
          alias: "essay",
        })
      },
    })
    const result = await presentOnBenchWithTestContext({
      directory: project.path,
      sessionID: SESSION_ID,
      action: "present_resource",
      path: null,
      resourceKey: "essay",
      objectID: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "unsupported_target",
      target: null,
    })
  })
})

function snapshotFor(input: { phase: "running" | "completed" | "error"; benchStatus?: string }) {
  return resolveToolPresentationSnapshot(
    benchPresentTool.presentation,
    Object.assign(
      {
        toolID: "bench_present",
        phase: input.phase,
        input: { action: "present_object" },
        metadata: input.benchStatus ? { benchStatus: input.benchStatus } : {},
      },
      input.phase === "error" ? { error: "boom" } : undefined,
    ),
  )
}

describe("bench_present presentation", () => {

  test("a successful presentation is an inline receipt, not an activity line", () => {
    const snapshot = snapshotFor({ phase: "completed", benchStatus: "presented" })

    expect(snapshot.archetype).toBe("inline-output")
    expect(snapshot.outcome).toEqual({ type: "success" })
    if (snapshot.archetype !== "inline-output") throw new Error("expected inline output")
    expect(snapshot.collection).toBe("bench-present-collection")
    expect(snapshot.layoutRole).toBe("compact-output")
  })

  test("an active presentation stays in transcript activity until it earns a receipt", () => {
    const snapshot = snapshotFor({ phase: "running" })

    expect(snapshot).toMatchObject({
      archetype: "inline-output",
      activeDisplay: "activity",
      outcome: { type: "active" },
    })
  })

  test("closing and re-presenting leave no receipt", () => {
    // Closing has no target to point at, and re-presenting would duplicate the
    // receipt the original call already left in the transcript.
    for (const benchStatus of ["closed", "already_presenting"]) {
      const snapshot = snapshotFor({ phase: "completed", benchStatus })
      expect(snapshot.outcome).toEqual({ type: "silent", reason: "no-op" })
    }
  })

  test("a failure stays visible so it can fall back to the activity strip", () => {
    const snapshot = snapshotFor({ phase: "error", benchStatus: "error" })
    expect(snapshot.outcome).toEqual({ type: "failure" })
  })
})
