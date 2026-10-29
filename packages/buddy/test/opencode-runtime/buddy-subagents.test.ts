import { createOpenCodeRuntime } from "@buddy/opencode-adapter/runtime"
import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import {
  createOpenCodeHost,
  type OpenCodeHost,
  type OpenCodeEvent,
} from "@buddy/opencode-adapter/host"
import { Plugin, ToolError } from "@buddy/opencode-adapter/plugin"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { toBuddyPermissionRules } from "@buddy/transcript-contract/permission-rules"
import { createRuntimeExtensionPlugin } from "@buddy/opencode-adapter/extension/plugin"
import { createBuddyRuntimeExtension } from "../../src/runtime/buddy-extension"
import { readBuddyTeachingSnapshot } from "../../src/learning/agent-execution/state/teaching-session-metadata"
import {
  clearAllTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { createGitRepo } from "../helpers/repo"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { writeProjectConfig } from "../helpers/project-config"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { syncBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/runtime-session-permissions"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { Config } from "../../src/config/config"
import { listObjects, readObjectManifest } from "../../src/objects/store"
import { subagentScriptedModel, type ModelRequest } from "./subagent-scripted-model"

afterEach(clearAllTeachingSessionState)

async function fixture(
  options: {
    hold?: (request: ModelRequest) => Promise<void>
    rejectPrompt?: (text: string) => boolean
    project?: Config.Info
    depth?: number
    onContext?: (sessionID: string) => void
    delayCatalog?: () => Promise<void>
  } = {},
) {
  const root = await temporaryDirectory({ prefix: "buddy-subagents-host-" })
  const repo = await createGitRepo("buddy-subagents-notebook")
  const directory = repo.path
  const paths = {
    data: path.join(root.path, "data"),
    cache: path.join(root.path, "cache"),
    config: path.join(root.path, "config"),
    state: path.join(root.path, "state"),
    tmp: path.join(root.path, "tmp"),
  }
  await Promise.all(Object.values(paths).map((value) => fs.mkdir(value, { recursive: true })))
  writeProjectConfig(
    directory,
    JSON.stringify({
      model: "scripted/chat",
      provider: {
        scripted: {
          npm: "@ai-sdk/perplexity",
          options: { apiKey: "test" },
          models: { chat: {}, author: {} },
        },
      },
      ...options.project,
    }),
  )
  const requests: ModelRequest[] = []
  const firstStates = new Map<string, ReturnType<typeof readTeachingSessionState>>()
  let host: OpenCodeHost
  async function start() {
    const ready = Promise.withResolvers<OpenCodeHost>()
    const extension = createBuddyRuntimeExtension()
    host = await createOpenCodeHost({
      clientName: "buddy-subagent-test",
      paths,
      databasePath: path.join(paths.data, "opencode.db"),
      fetchModels: false,
      fs: { filewatcher: false, fff: false },
      config: {
        project: false,
        content:
          options.depth === undefined
            ? undefined
            : JSON.stringify({ experimental: { subagent_depth: options.depth } }),
      },
      instances: {
        key: () => "buddy.runtime.v1",
        configure: () => ({
          plugins: [
            subagentScriptedModel({ requests, hold: options.hold }),
            createRuntimeExtensionPlugin(extension, () => ready.promise),
            Plugin.define({
              id: "buddy.test.subagent-observe",
              async setup(ctx) {
                await ctx.session.hook("prompt", (event) => {
                  if (options.rejectPrompt?.(event.prompt.text ?? ""))
                    throw new ToolError({ message: "Fixture admission rejected" })
                })
                await ctx.session.hook("context", (event) => {
                  if (!firstStates.has(event.sessionID))
                    firstStates.set(
                      event.sessionID,
                      structuredClone(readTeachingSessionState(directory, event.sessionID)),
                    )
                  options.onContext?.(event.sessionID)
                })
              },
            }),
          ],
        }),
      },
      plugins: options.delayCatalog
        ? []
        : [createRuntimeExtensionPlugin(extension, () => ready.promise, "catalog")],
    })
    ready.resolve(host)
    if (options.delayCatalog) {
      await options.delayCatalog()
      await host.plugin(createRuntimeExtensionPlugin(extension, () => ready.promise, "catalog"))
    }
    await syncNotebookRuntimeConfig(directory, { runtime: createOpenCodeRuntime(host) })
    return host
  }
  try {
    await start()
    return {
      get host() {
        return host
      },
      directory,
      requests,
      firstStates,
      async restart(beforeStart?: (databasePath: string) => void) {
        await host.close()
        beforeStart?.(path.join(paths.data, "opencode.db"))
        clearAllTeachingSessionState()
        firstStates.clear()
        return await start()
      },
      [Symbol.asyncDispose]: async () => {
        await host.close()
        await repo[Symbol.asyncDispose]()
        await root[Symbol.asyncDispose]()
      },
    }
  } catch (cause) {
    await repo[Symbol.asyncDispose]()
    await root[Symbol.asyncDispose]()
    throw cause
  }
}

async function rootSession(runtime: Awaited<ReturnType<typeof fixture>>) {
  const session = await runtime.host.session.create({
    location: { directory: runtime.directory },
    agent: "buddy",
    model: { providerID: "scripted", id: "chat" },
    permissions: [{ action: "websearch", resource: "*", effect: "deny" }],
    metadata: { unrelated: "preserve" },
  })
  writeTeachingSessionState(runtime.directory, {
    sessionId: session.id,
    persona: "buddy",
    currentSurface: "curriculum",
    teachingWorkspaceState: "active",
    focusGoalIds: ["goal-1"],
    conciseResponses: true,
    baseConciseResponses: true,
    learnerContextDigest: "parent-only",
  })
  return session
}

async function delegate(
  runtime: Awaited<ReturnType<typeof fixture>>,
  sessionID: string,
  input: {
    agent: string
    prompt: string
    background?: boolean
    sessionID?: string
    model?: string
  },
) {
  await runtime.host.session.prompt({
    sessionID,
    text: `fixture-delegate:${JSON.stringify({ description: "Author learning material", ...input })}`,
  })
  await runtime.host.session.wait({ sessionID })
  const messages = (await runtime.host.message.list({ sessionID, order: "asc" })).data
  const tool = messages
    .flatMap((message) =>
      message.type === "assistant"
        ? message.content
            .filter((part) => part.type === "tool")
            .filter((part) => part.name === "subagent")
        : [],
    )
    .at(-1)
  if (!tool) throw new Error(`Missing native tool: ${JSON.stringify(messages)}`)
  return tool
}

async function nextEvent(
  iterator: AsyncIterator<OpenCodeEvent>,
  matches: (event: OpenCodeEvent) => boolean,
) {
  while (true) {
    const next = await iterator.next()
    if (next.done) throw new Error("Event stream ended")
    if (matches(next.value)) return next.value
  }
}

function childID(tool: Awaited<ReturnType<typeof delegate>>): string {
  const value = tool.state.status === "streaming" ? undefined : tool.state.metadata?.sessionID
  if (!value) throw new Error(`Missing child ID: ${JSON.stringify(tool)}`)
  return String(value)
}

function toolNames(request: ModelRequest) {
  return request.tools?.flatMap((tool) => (tool.type === "function" ? [tool.name] : [])) ?? []
}

describe("Buddy native subagents", () => {
  test.each([
    {
      role: "flashcard-author",
      kind: "flashcard",
      save: "save_flashcard_deck",
      other: "save_question_set",
      objectKind: "flashcard-deck",
    },
    {
      role: "question-set-author",
      kind: "question",
      save: "save_question_set",
      other: "save_flashcard_deck",
      objectKind: "question-set",
    },
  ])(
    "prepares $role before the first actual model request and attributes saved objects",
    async ({ role, kind, save, other }) => {
      await using runtime = await fixture()
      const parent = await rootSession(runtime)
      const tool = await delegate(runtime, parent.id, {
        agent: role,
        prompt: `fixture-child:${kind}`,
      })
      expect(tool.state.status).toBe("completed")
      const id = childID(tool)
      const child = await runtime.host.session.get({ sessionID: id })
      const snapshot = readBuddyTeachingSnapshot(child.metadata)
      expect(snapshot).toMatchObject({
        version: 1,
        ownerSessionID: id,
        rootSessionID: parent.id,
        roleID: role,
        teaching: {
          persona: "buddy",
          teachingWorkspaceState: "active",
          focusGoalIds: ["goal-1"],
          conciseResponses: true,
        },
      })
      expect(child.metadata?.unrelated).toBe("preserve")
      const first = runtime.requests.find(
        (request) =>
          JSON.stringify(request.prompt).includes(
            "You are a subagent spawned by another session.",
          ) && JSON.stringify(request.prompt).includes(`fixture-child:${kind}`),
      )
      if (!first) throw new Error("Missing child model request")
      expect(toolNames(first)).toContain(save)
      expect(toolNames(first)).not.toContain(other)
      expect(toolNames(first)).not.toContain("websearch")
      expect(toolNames(first)).not.toContain("subagent")
      if (kind === "flashcard") expect(toolNames(first)).toContain("ingest_full_text")
      expect(runtime.firstStates.get(id)?.focusGoalIds).toEqual(["goal-1"])
      expect(runtime.firstStates.get(id)?.learnerContextDigest).toBeUndefined()
      const objects = await listObjects({
        directory: runtime.directory,
        kind: kind === "flashcard" ? "flashcard-deck" : "question-set",
      })
      expect(objects.loadErrors).toEqual([])
      expect(objects.objects).toHaveLength(1)
      const saved = objects.objects[0]
      if (!saved) throw new Error("Missing saved object")
      const manifest = await readObjectManifest({
        directory: runtime.directory,
        kind: saved.kind,
        objectID: saved.objectID,
      })
      expect(manifest.origin?.kind).toBe("tool")
      if (manifest.origin?.kind !== "tool") throw new Error("Missing tool origin")
      expect(manifest.origin.sessionID).toBe(id)
    },
  )

  test("direct authors preserve existing teaching state, hydrate after eviction, and reject role-changing continuation", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const direct = await runtime.host.session.create({
      location: { directory: runtime.directory },
      agent: "flashcard-author",
      title: "Direct flashcard author",
      model: { providerID: "scripted", id: "chat" },
    })
    writeTeachingSessionState(runtime.directory, {
      sessionId: direct.id,
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
      focusGoalIds: ["direct-goal"],
    })
    await runtime.host.session.prompt({ sessionID: direct.id, text: "fixture-child:direct" })
    await runtime.host.session.wait({ sessionID: direct.id })
    expect(
      readBuddyTeachingSnapshot((await runtime.host.session.get({ sessionID: direct.id })).metadata)
        ?.teaching.focusGoalIds,
    ).toEqual(["direct-goal"])
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:continue",
    })
    const id = childID(tool)
    writeTeachingSessionState(runtime.directory, {
      sessionId: id,
      persona: "buddy",
      currentSurface: "flashcard",
      teachingWorkspaceState: "inactive",
      focusGoalIds: ["child-goal"],
    })
    await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:continue-next",
      sessionID: id,
      model: "scripted/author",
    })
    const child = await runtime.host.session.get({ sessionID: id })
    expect(child.model?.id).toBe("author")
    expect(readBuddyTeachingSnapshot(child.metadata)?.teaching.focusGoalIds).toEqual(["child-goal"])
    for (let index = 0; index < 513; index++)
      writeTeachingSessionState(runtime.directory, {
        sessionId: `evict-${index}`,
        persona: "buddy",
        currentSurface: "curriculum",
        teachingWorkspaceState: "inactive",
        focusGoalIds: [],
      })
    expect(readTeachingSessionState(runtime.directory, id)).toBeUndefined()
    const definition = REGISTERED_BUDDY_PERSONAS.find((entry) => entry.id === "buddy")
    if (!definition) throw new Error("Missing persona")
    await syncBuddyRuntimeSessionPermissions({
      runtime: createOpenCodeRuntime(runtime.host),
      directory: runtime.directory,
      sessionID: id,
      sessionRuntime: resolveSessionRuntime({
        persona: definition,
        teachingWorkspaceState: "inactive",
        config: await Config.getProject(runtime.directory),
      }),
    })
    expect((await runtime.host.session.get({ sessionID: id })).permissions).toEqual(
      child.permissions,
    )
    await runtime.host.session.prompt({ sessionID: id, text: "fixture-child:after-eviction" })
    await runtime.host.session.wait({ sessionID: id })
    expect(readTeachingSessionState(runtime.directory, id)?.focusGoalIds).toEqual(["child-goal"])
    const rejected = await delegate(runtime, parent.id, {
      agent: "question-set-author",
      prompt: "fixture-child:forbidden",
      sessionID: id,
    })
    expect(rejected.state.status).toBe("error")
    if (rejected.state.status === "error")
      expect(rejected.state.error.message).toContain("start a fresh child")
    expect((await runtime.host.session.get({ sessionID: id })).agent).toBe("flashcard-author")
  })
})

function heldWorker() {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let active = true
  return {
    entered: entered.promise,
    resume: () => {
      active = false
    },
    release: () => {
      active = false
      release.resolve()
    },
    async hold(request: ModelRequest) {
      const text = JSON.stringify(request.prompt)
      if (
        !active ||
        !text.includes("You are a subagent spawned by another session.") ||
        !text.includes("fixture-child:hold")
      )
        return
      entered.resolve()
      const signal = request.abortSignal
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new Error("Scripted request interrupted"))
        if (signal?.aborted) {
          abort()
          return
        }
        signal?.addEventListener("abort", abort, { once: true })
        release.promise.then(() => {
          signal?.removeEventListener("abort", abort)
          resolve()
        })
      })
    },
  }
}

async function watchEvents(host: OpenCodeHost) {
  const controller = new AbortController()
  const events = host.event
    .subscribe({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) })
    [Symbol.asyncIterator]()
  await nextEvent(events, (event) => event.type === "server.connected")
  return {
    events,
    [Symbol.asyncDispose]: async () => {
      controller.abort()
      await events.return?.()
    },
  }
}

describe("native subagent cancellation and recovery", () => {
  test("interrupting a blocking owner stops its child without discarding prepared state", async () => {
    const worker = heldWorker()
    await using runtime = await fixture({ hold: worker.hold })
    const parent = await rootSession(runtime)
    await using watch = await watchEvents(runtime.host)
    const pending = delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:hold-blocking",
    })
    await worker.entered
    const progress = await nextEvent(
      watch.events,
      (event) => event.type === "session.tool.progress" && event.data.sessionID === parent.id,
    )
    if (progress.type !== "session.tool.progress") throw new Error("Missing child progress")
    const id = String(progress.data.metadata.sessionID)
    await runtime.host.session.interrupt({ sessionID: parent.id })
    await pending
    await runtime.host.session.wait({ sessionID: id })
    expect((await runtime.host.session.active())[id]).toBeUndefined()
    expect(
      readBuddyTeachingSnapshot((await runtime.host.session.get({ sessionID: id })).metadata)
        ?.ownerSessionID,
    ).toBe(id)
    worker.release()
  })

  test("background launch stays running until explicit child stop produces a cancelled completion", async () => {
    const worker = heldWorker()
    await using runtime = await fixture({ hold: worker.hold })
    const parent = await rootSession(runtime)
    await using watch = await watchEvents(runtime.host)
    const authored = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:flashcard-before-stop",
    })
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      sessionID: childID(authored),
      prompt: "fixture-child:hold-background",
      background: true,
    })
    await worker.entered
    const id = childID(tool)
    expect(tool.state.status).toBe("completed")
    if (tool.state.status !== "completed") throw new Error("Expected completed launch")
    expect(tool.state.metadata?.status).toBe("running")
    await runtime.host.session.interrupt({ sessionID: parent.id })
    expect((await runtime.host.session.active())[id]).toBeDefined()
    await runtime.host.session.interrupt({ sessionID: id })
    const terminal = await nextEvent(
      watch.events,
      (event) =>
        event.type === "session.inbox.enqueued" &&
        event.data.sessionID === parent.id &&
        event.data.item.type === "synthetic" &&
        event.data.item.payload.metadata?.childID === id,
    )
    if (terminal.type !== "session.inbox.enqueued" || terminal.data.item.type !== "synthetic")
      throw new Error("Missing completion")
    expect(terminal.data.item.payload.metadata).toMatchObject({
      source: "subagent",
      childID: id,
      state: "cancelled",
    })
    await runtime.host.session.wait({ sessionID: parent.id })
    expect((await runtime.host.session.active())[id]).toBeUndefined()
    const objects = await listObjects({ directory: runtime.directory, kind: "flashcard-deck" })
    expect(objects.objects).toHaveLength(1)
    const saved = objects.objects[0]
    if (!saved) throw new Error("Missing preserved deck")
    expect(
      (
        await readObjectManifest({
          directory: runtime.directory,
          kind: "flashcard-deck",
          objectID: saved.objectID,
        })
      ).origin,
    ).toMatchObject({ sessionID: id })
    worker.release()
  })

  test("moving the blocking owner to background detaches its worker and admits one completion", async () => {
    const worker = heldWorker()
    await using runtime = await fixture({ hold: worker.hold })
    const parent = await rootSession(runtime)
    await using watch = await watchEvents(runtime.host)
    const pending = delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:hold-promoted",
    })
    await worker.entered
    await runtime.host.session.background({ sessionID: parent.id })
    const tool = await pending
    const id = childID(tool)
    if (tool.state.status !== "completed") throw new Error("Expected completed launch")
    expect(tool.state.metadata?.status).toBe("running")
    await runtime.host.session.interrupt({ sessionID: parent.id })
    expect((await runtime.host.session.active())[id]).toBeDefined()
    worker.release()
    await nextEvent(
      watch.events,
      (event) =>
        event.type === "session.inbox.enqueued" &&
        event.data.sessionID === parent.id &&
        event.data.item.type === "synthetic" &&
        event.data.item.payload.metadata?.childID === id,
    )
    await runtime.host.session.wait({ sessionID: parent.id })
    const notices = (await runtime.host.message.list({ sessionID: parent.id })).data.filter(
      (message) => message.type === "synthetic" && message.metadata?.childID === id,
    )
    expect(notices).toHaveLength(1)
    expect(notices[0]?.metadata?.state).toBe("completed")
  })

  test("resumes unfinished background work on the temporary database with empty caches and no duplicate notice", async () => {
    const worker = heldWorker()
    await using runtime = await fixture({ hold: worker.hold })
    const parent = await rootSession(runtime)
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:hold-recover",
      background: true,
    })
    await worker.entered
    const id = childID(tool)
    const prepared = readBuddyTeachingSnapshot(
      (await runtime.host.session.get({ sessionID: id })).metadata,
    )
    worker.resume()
    await runtime.restart()
    await runtime.host.session.wait({ sessionID: id })
    await runtime.host.session.wait({ sessionID: parent.id })
    expect(
      readBuddyTeachingSnapshot((await runtime.host.session.get({ sessionID: id })).metadata),
    ).toEqual(prepared)
    expect(runtime.firstStates.get(id)?.focusGoalIds).toEqual(["goal-1"])
    const page = (await runtime.host.message.list({ sessionID: parent.id })).data
    expect(
      page.filter((message) => message.type === "synthetic" && message.metadata?.childID === id),
    ).toHaveLength(1)
    await runtime.restart()
    const again = (await runtime.host.message.list({ sessionID: parent.id })).data
    expect(
      again.filter((message) => message.type === "synthetic" && message.metadata?.childID === id),
    ).toHaveLength(1)
  })
})

describe("delegation admission boundaries", () => {
  test("direct default-persona authors receive their own save tool and standalone internal sessions keep explicit envelopes", async () => {
    await using runtime = await fixture()
    const direct = await runtime.host.session.create({
      location: { directory: runtime.directory },
      agent: "question-set-author",
      title: "Direct question author",
      model: { providerID: "scripted", id: "chat" },
    })
    await runtime.host.session.prompt({
      sessionID: direct.id,
      text: "fixture-child:direct-default",
    })
    await runtime.host.session.wait({ sessionID: direct.id })
    expect(readTeachingSessionState(runtime.directory, direct.id)?.persona).toBe("buddy")
    const first = runtime.requests.find((request) =>
      JSON.stringify(request.prompt).includes("fixture-child:direct-default"),
    )
    if (!first) throw new Error("Missing direct request")
    expect(toolNames(first)).toContain("save_question_set")
    expect(toolNames(first)).not.toContain("save_flashcard_deck")
    const envelope = [
      { action: "read", resource: "memory/*", effect: "allow" },
      { action: "edit", resource: "memory/*", effect: "allow" },
      { action: "subagent", resource: "*", effect: "deny" },
    ] satisfies NonNullable<Parameters<OpenCodeHost["session"]["create"]>[0]>["permissions"]
    const internal = await runtime.host.session.create({
      location: { directory: runtime.directory },
      agent: "learner-memory-consolidator",
      title: "Internal memory",
      model: { providerID: "scripted", id: "chat" },
      permissions: envelope,
    })
    await runtime.host.session.prompt({ sessionID: internal.id, text: "fixture-child:internal" })
    await runtime.host.session.wait({ sessionID: internal.id })
    const saved = await runtime.host.session.get({ sessionID: internal.id })
    expect(saved.permissions).toEqual(envelope)
    expect(saved.metadata?.buddyTeaching).toBeUndefined()
    expect(readTeachingSessionState(runtime.directory, internal.id)).toBeUndefined()
    const request = runtime.requests.find((item) =>
      JSON.stringify(item.prompt).includes("fixture-child:internal"),
    )
    if (!request) throw new Error("Missing internal request")
    expect(toolNames(request)).not.toContain("save_question_set")
    await runtime.restart()
    await runtime.host.session.generate({
      sessionID: internal.id,
      prompt: "fixture-child:internal-restarted",
    })
    expect((await runtime.host.session.get({ sessionID: internal.id })).permissions).toEqual(
      envelope,
    )
    expect(readTeachingSessionState(runtime.directory, internal.id)).toBeUndefined()
  })

  test("native spawn rejects primary and unknown agents and unrelated continuations", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const stranger = await rootSession(runtime)
    for (const input of [
      { agent: "buddy" },
      { agent: "missing-agent" },
      { agent: "flashcard-author", sessionID: stranger.id },
      { agent: "flashcard-author", sessionID: "ses_missing" },
    ]) {
      const tool = await delegate(runtime, parent.id, {
        ...input,
        prompt: "fixture-child:rejected",
      })
      expect(tool.state.status).toBe("error")
      if (tool.state.status !== "error") throw new Error("Expected spawn failure")
      expect(tool.state.error.type).toBe("tool.execution")
    }
    expect(
      runtime.requests.some((request) =>
        JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
      ),
    ).toBe(false)
  })

  test("successful preparation survives later admission failure and retry hydrates without tentative cache state", async () => {
    let reject = true
    await using runtime = await fixture({
      rejectPrompt: (text) => text.includes("fixture-child:retry") && reject,
    })
    const child = await runtime.host.session.create({
      location: { directory: runtime.directory },
      agent: "flashcard-author",
      title: "Direct flashcard author",
      model: { providerID: "scripted", id: "chat" },
    })
    await expect(
      runtime.host.session.prompt({ sessionID: child.id, text: "fixture-child:retry" }),
    ).rejects.toMatchObject({ message: "UnexpectedStatus: 500" })
    const prepared = await runtime.host.session.get({ sessionID: child.id })
    expect(readBuddyTeachingSnapshot(prepared.metadata)?.roleID).toBe("flashcard-author")
    expect(readTeachingSessionState(runtime.directory, child.id)).toBeUndefined()
    reject = false
    await runtime.host.session.prompt({ sessionID: child.id, text: "fixture-child:retry" })
    await runtime.host.session.wait({ sessionID: child.id })
    expect(readTeachingSessionState(runtime.directory, child.id)?.persona).toBe("buddy")
  })

  test("missing or corrupt child preparation fails an auxiliary request before provider execution", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:prepared",
    })
    const id = childID(tool)
    const current = await runtime.host.session.get({ sessionID: id })
    const snapshot = readBuddyTeachingSnapshot(current.metadata)
    if (!snapshot) throw new Error("Missing prepared snapshot")
    for (const invalid of [null, { ...snapshot, version: 999 }]) {
      await runtime.host.session.update({
        sessionID: id,
        metadata: { ...current.metadata, buddyTeaching: invalid },
      })
      clearAllTeachingSessionState()
      const before = runtime.requests.length
      await expect(
        runtime.host.session.generate({ sessionID: id, prompt: "fixture-child:unprepared" }),
      ).rejects.toMatchObject({ message: "UnexpectedStatus: 500" })
      expect(runtime.requests).toHaveLength(before)
    }
  })
})

describe("snapshot eligibility and teaching preferences", () => {
  test.each([false, true])(
    "publishes memory-owned extras only with the experimental feature enabled: %s",
    async (enabled) => {
      const previous = await Config.getGlobal()
      try {
        await Config.replaceGlobal(
          Config.Info.parse({
            ...previous,
            experimental_features: { ...previous.experimental_features, learner_memory: enabled },
            learner_memory: { ...previous.learner_memory, enabled: true },
          }),
        )
        await using runtime = await fixture()
        const parent = await rootSession(runtime)
        await runtime.host.session.prompt({
          sessionID: parent.id,
          text: "Publish the delegation source.",
        })
        await runtime.host.session.wait({ sessionID: parent.id })
        const source = readBuddyTeachingSnapshot(
          (await runtime.host.session.get({ sessionID: parent.id })).metadata,
        )?.source
        if (!source) throw new Error("Missing delegation source")
        expect(source.extraToolsByRole["assessment-agent"]?.includes("learner_memory_update")).toBe(
          enabled,
        )
        expect(source.enabledFeatureIDs.includes("memory")).toBe(enabled)
        expect(source.access.subagents["curriculum-orchestrator"]).toBeUndefined()
      } finally {
        await Config.replaceGlobal(previous)
      }
    },
  )

  test("refreshes policy only on continuation and retains child resource restrictions and teaching state", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const tool = await delegate(runtime, parent.id, {
      agent: "question-set-author",
      prompt: "fixture-child:policy-first",
    })
    const id = childID(tool)
    const child = await runtime.host.session.get({ sessionID: id })
    const initial = readBuddyTeachingSnapshot(child.metadata)
    await runtime.host.session.update({
      sessionID: id,
      permissions: [
        ...(child.permissions ?? []),
        { action: "edit", resource: "private/*", effect: "deny" },
      ],
    })
    await runtime.host.session.update({
      sessionID: parent.id,
      permissions: [
        { action: "websearch", resource: "*", effect: "allow" },
        { action: "edit", resource: "notes/*", effect: "ask" },
      ],
    })
    expect(
      readBuddyTeachingSnapshot((await runtime.host.session.get({ sessionID: id })).metadata),
    ).toEqual(initial)
    await delegate(runtime, parent.id, {
      agent: "question-set-author",
      sessionID: id,
      prompt: "fixture-child:policy-next",
    })
    const continued = await runtime.host.session.get({ sessionID: id })
    const snapshot = readBuddyTeachingSnapshot(continued.metadata)
    expect(snapshot?.teaching).toEqual(initial?.teaching)
    expect(snapshot?.policyRevision).not.toBe(initial?.policyRevision)
    const rules = toBuddyPermissionRules(continued.permissions ?? [])
    expect(evaluatePermission("websearch", "*", rules).action).toBe("allow")
    expect(evaluatePermission("edit", "notes/lesson.md", rules).action).toBe("ask")
    expect(evaluatePermission("edit", "private/lesson.md", rules).action).toBe("deny")
    const request = runtime.requests.findLast((entry) =>
      JSON.stringify(entry.prompt).includes("fixture-child:policy-next"),
    )
    if (!request) throw new Error("Missing continued request")
    expect(toolNames(request)).toContain("websearch")
  })

  test.each([
    { project: { tools: { save_flashcard_deck: false } } },
    {
      project: {
        agent: { "flashcard-author": { options: {}, permission: { save_flashcard_deck: "deny" } } },
      },
    },
  ] satisfies { project: Config.Info }[])(
    "respects explicit project and authored tool offs",
    async ({ project }) => {
      await using runtime = await fixture({ project })
      const parent = await rootSession(runtime)
      await delegate(runtime, parent.id, {
        agent: "flashcard-author",
        prompt: "fixture-child:flashcard-disabled",
      })
      const first = runtime.requests.find((request) =>
        JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
      )
      if (!first) throw new Error("Missing child request")
      expect(toolNames(first)).not.toContain("save_flashcard_deck")
      expect(
        (await listObjects({ directory: runtime.directory, kind: "flashcard-deck" })).objects,
      ).toEqual([])
    },
  )

  test("takes launch teaching state, resolves the child surface and uses the configured concise preference", async () => {
    const previous = await Config.getGlobal()
    try {
      await Config.replaceGlobal(Config.Info.parse({ ...previous, concise_responses: false }))
      await using runtime = await fixture({
        project: { personas: { "teaching-buddy": { surfaces: ["curriculum", "editor"] } } },
      })
      const parent = await rootSession(runtime)
      await runtime.host.session.switchAgent({ sessionID: parent.id, agent: "teaching-buddy" })
      writeTeachingSessionState(runtime.directory, {
        sessionId: parent.id,
        persona: "teaching-buddy",
        currentSurface: "flashcard",
        teachingWorkspaceState: "active",
        focusGoalIds: ["launch-goal"],
        conciseResponses: true,
        baseConciseResponses: true,
      })
      const tool = await delegate(runtime, parent.id, {
        agent: "flashcard-author",
        prompt: "fixture-child:snapshot",
      })
      const id = childID(tool)
      const child = readBuddyTeachingSnapshot(
        (await runtime.host.session.get({ sessionID: id })).metadata,
      )
      expect(child?.teaching).toMatchObject({
        persona: "teaching-buddy",
        currentSurface: "editor",
        conciseResponses: false,
        baseConciseResponses: false,
        focusGoalIds: ["launch-goal"],
      })
      writeTeachingSessionState(runtime.directory, {
        sessionId: parent.id,
        persona: "buddy",
        currentSurface: "curriculum",
        teachingWorkspaceState: "inactive",
        focusGoalIds: ["new-parent-goal"],
      })
      await runtime.host.session.update({
        sessionID: parent.id,
        permissions: [{ action: "websearch", resource: "*", effect: "deny" }],
      })
      expect(
        readBuddyTeachingSnapshot((await runtime.host.session.get({ sessionID: id })).metadata)
          ?.teaching,
      ).toEqual(child?.teaching)
    } finally {
      await Config.replaceGlobal(previous)
    }
  })
})

describe("native depth and concurrent children", () => {
  test("independent authors in one native model turn receive isolated policy and saved objects", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const inputs = [
      JSON.stringify({
        agent: "flashcard-author",
        description: "Build deck",
        prompt: "fixture-child:flashcard-parallel",
      }),
      JSON.stringify({
        agent: "question-set-author",
        description: "Build quiz",
        prompt: "fixture-child:question-parallel",
      }),
    ]
    await runtime.host.session.prompt({
      sessionID: parent.id,
      text: `fixture-parallel:${JSON.stringify(inputs)}`,
    })
    await runtime.host.session.wait({ sessionID: parent.id })
    const children = (await runtime.host.session.list({ parentID: parent.id })).data
    expect(children).toHaveLength(2)
    expect(new Set(children.map((child) => child.id)).size).toBe(2)
    for (const child of children) {
      const snapshot = readBuddyTeachingSnapshot(child.metadata)
      expect(snapshot?.ownerSessionID).toBe(child.id)
      expect(snapshot?.roleID).toBe(child.agent)
      const kind = child.agent === "flashcard-author" ? "flashcard-deck" : "question-set"
      const objects = await listObjects({ directory: runtime.directory, kind })
      expect(objects.objects).toHaveLength(1)
      const saved = objects.objects[0]
      if (!saved) throw new Error("Missing child object")
      const manifest = await readObjectManifest({
        directory: runtime.directory,
        kind,
        objectID: saved.objectID,
      })
      expect(manifest.origin).toMatchObject({ sessionID: child.id })
    }
  })

  test.each([1, 2])(
    "uses upstream depth %s with an explicitly narrow orchestrator fixture",
    async (depth) => {
      await using runtime = await fixture({
        depth,
        project: {
          agent: {
            "fixture-owner": {
              options: {},
              mode: "primary",
              prompt: "Delegate the fixture task.",
              permission: {
                "*": "deny",
                subagent: { "curriculum-orchestrator": "allow", "goal-writer": "allow" },
              },
            },
          },
        },
      })
      const parent = await rootSession(runtime)
      await runtime.host.session.prompt({
        sessionID: parent.id,
        text: "Prepare the teaching source.",
      })
      await runtime.host.session.wait({ sessionID: parent.id })
      const current = await runtime.host.session.get({ sessionID: parent.id })
      const snapshot = readBuddyTeachingSnapshot(current.metadata)
      if (!snapshot) throw new Error("Missing source")
      snapshot.source.access.subagents = {
        "curriculum-orchestrator": "allow",
        "goal-writer": "allow",
      }
      snapshot.source.rules = [
        { permission: "*", pattern: "*", action: "deny" },
        { permission: "subagent", pattern: "curriculum-orchestrator", action: "allow" },
        { permission: "subagent", pattern: "goal-writer", action: "allow" },
      ]
      await runtime.host.session.update({
        sessionID: parent.id,
        permissions: [{ action: "subagent", resource: "curriculum-orchestrator", effect: "allow" }],
        metadata: { ...current.metadata, buddyTeaching: snapshot },
      })
      await runtime.host.session.switchAgent({ sessionID: parent.id, agent: "fixture-owner" })
      const nested = `fixture-delegate:${JSON.stringify({ agent: "goal-writer", description: "Write fixture goal", prompt: "fixture-child:goal" })}`
      const tool = await delegate(runtime, parent.id, {
        agent: "curriculum-orchestrator",
        prompt: nested,
      })
      const orchestratorID = childID(tool)
      const descendants = (await runtime.host.session.list({ parentID: orchestratorID })).data
      if (depth === 1) {
        expect(descendants).toEqual([])
        const messages = (await runtime.host.message.list({ sessionID: orchestratorID })).data
        expect(JSON.stringify(messages)).toContain("Subagent depth limit reached (1)")
      } else {
        expect(descendants).toHaveLength(1)
        const descendant = descendants[0]
        if (!descendant) throw new Error("Missing goal writer")
        expect(readBuddyTeachingSnapshot(descendant.metadata)).toMatchObject({
          rootSessionID: parent.id,
          ownerSessionID: descendant.id,
          roleID: "goal-writer",
        })
        const request = runtime.requests.find(
          (entry) =>
            JSON.stringify(entry.prompt).includes(
              "You are a subagent spawned by another session.",
            ) &&
            JSON.stringify(entry.prompt).includes("fixture-child:goal") &&
            !JSON.stringify(entry.prompt).includes("fixture-delegate:"),
        )
        if (!request) throw new Error("Missing descendant model request")
        expect(toolNames(request)).not.toContain("subagent")
        expect(toolNames(request)).not.toContain("read")
        expect(toolNames(request)).not.toContain("save_flashcard_deck")
      }
    },
  )
})

async function recoveredNotice(host: OpenCodeHost, parentID: string, childID: string) {
  await using watch = await watchEvents(host)
  const page = await host.message.list({ sessionID: parentID })
  const delivered = page.data.find(
    (message) => message.type === "synthetic" && message.metadata?.childID === childID,
  )
  if (delivered) return delivered.metadata
  const inbox = await host.session.inbox.list({ sessionID: parentID })
  const pending = inbox.find(
    (item) => item.type === "synthetic" && item.payload.metadata?.childID === childID,
  )
  if (pending?.type === "synthetic") return pending.payload.metadata
  const event = await nextEvent(
    watch.events,
    (event) =>
      event.type === "session.inbox.enqueued" &&
      event.data.sessionID === parentID &&
      event.data.item.type === "synthetic" &&
      event.data.item.payload.metadata?.childID === childID,
  )
  if (event.type !== "session.inbox.enqueued" || event.data.item.type !== "synthetic")
    throw new Error("Missing recovery completion")
  return event.data.item.payload.metadata
}

describe("recovery preparation errors", () => {
  test.each([null, { version: 999 }])(
    "fails recovered work with invalid preparation before another child model request",
    async (invalid) => {
      const worker = heldWorker()
      await using runtime = await fixture({ hold: worker.hold })
      const parent = await rootSession(runtime)
      const tool = await delegate(runtime, parent.id, {
        agent: "flashcard-author",
        prompt: "fixture-child:hold-invalid-recovery",
        background: true,
      })
      await worker.entered
      const id = childID(tool)
      const child = await runtime.host.session.get({ sessionID: id })
      await runtime.host.session.update({
        sessionID: id,
        metadata: { ...child.metadata, buddyTeaching: invalid },
      })
      worker.resume()
      const before = runtime.requests.filter((request) =>
        JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
      ).length
      await runtime.restart()
      expect(await recoveredNotice(runtime.host, parent.id, id)).toMatchObject({
        source: "subagent",
        childID: id,
        state: "error",
      })
      const after = runtime.requests.filter((request) =>
        JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
      ).length
      expect(after).toBe(before)
      expect(runtime.firstStates.has(id)).toBe(false)
    },
  )
})

describe("boot-time instance installation", () => {
  test("prepares a recovered child's first request while host-wide catalog registration is delayed", async () => {
    const worker = heldWorker()
    const resumed = Promise.withResolvers<void>()
    let restarting = false
    let expectedChildID: string | undefined
    await using runtime = await fixture({
      hold: worker.hold,
      onContext: (sessionID) => {
        if (restarting && sessionID === expectedChildID) resumed.resolve()
      },
      delayCatalog: async () => {
        if (restarting) await resumed.promise
      },
    })
    const parent = await rootSession(runtime)
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:hold-delayed-registration",
      background: true,
    })
    await worker.entered
    expectedChildID = childID(tool)
    worker.resume()
    restarting = true
    await runtime.restart()
    expect(runtime.firstStates.get(expectedChildID)?.focusGoalIds).toEqual(["goal-1"])
    expect(await recoveredNotice(runtime.host, parent.id, expectedChildID)).toMatchObject({
      state: "completed",
    })
  })
})

describe("recovered family validation", () => {
  test.each(["missing", "unrelated"])(
    "refuses a %s family on the temporary database",
    async (family) => {
      const worker = heldWorker()
      await using runtime = await fixture({ hold: worker.hold })
      const parent = await rootSession(runtime)
      const unrelated = await rootSession(runtime)
      const tool = await delegate(runtime, parent.id, {
        agent: "flashcard-author",
        prompt: "fixture-child:hold-invalid-family",
        background: true,
      })
      await worker.entered
      const id = childID(tool)
      worker.resume()
      const before = runtime.requests.filter((request) =>
        JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
      ).length
      await runtime.restart((databasePath) => {
        const database = new Database(databasePath)
        try {
          database
            .query("UPDATE session_v2 SET parent_id = ? WHERE id = ?")
            .run(family === "missing" ? "ses_missing_parent" : unrelated.id, id)
        } finally {
          database.close()
        }
      })
      await expect(
        runtime.host.session.generate({ sessionID: id, prompt: "Validate recovered family." }),
      ).rejects.toMatchObject({ message: "UnexpectedStatus: 500" })
      expect(
        runtime.requests.filter((request) =>
          JSON.stringify(request.prompt).includes("You are a subagent spawned by another session."),
        ),
      ).toHaveLength(before)
      expect(runtime.firstStates.has(id)).toBe(false)
      expect(
        (await runtime.host.message.list({ sessionID: parent.id })).data.filter(
          (message) => message.type === "synthetic" && message.metadata?.childID === id,
        ),
      ).toEqual([])
    },
  )
})

describe("continuation policy admission", () => {
  test("rejects parallel role changes without admitting another child prompt", async () => {
    await using runtime = await fixture()
    const parent = await rootSession(runtime)
    const tool = await delegate(runtime, parent.id, {
      agent: "flashcard-author",
      prompt: "fixture-child:same-role",
    })
    const id = childID(tool)
    const inputs = ["question-set-author", "general"].map((agent) =>
      JSON.stringify({
        agent,
        sessionID: id,
        description: "Change specialist",
        prompt: "fixture-child:rejected-role",
      }),
    )
    await runtime.host.session.prompt({
      sessionID: parent.id,
      text: `fixture-parallel:${JSON.stringify(inputs)}`,
    })
    await runtime.host.session.wait({ sessionID: parent.id })
    const parts = (await runtime.host.message.list({ sessionID: parent.id })).data.flatMap(
      (message) =>
        message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [],
    )
    const failed = parts.filter((part) => part.state.status === "error")
    expect(failed).toHaveLength(2)
    for (const part of failed) {
      if (part.state.status !== "error") throw new Error("Expected role failure")
      expect(part.state.error.message).toContain("start a fresh child")
    }
    expect((await runtime.host.session.get({ sessionID: id })).agent).toBe("flashcard-author")
    expect(
      (await runtime.host.message.list({ sessionID: id })).data.filter(
        (message) => message.type === "user",
      ),
    ).toHaveLength(1)
  })
})
