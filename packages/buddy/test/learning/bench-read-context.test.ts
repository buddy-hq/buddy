import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, test } from "bun:test"
import {
  benchTargetKey,
  clearBenchContextRegistry,
  publishSequencedBenchContext,
  type BenchTarget,
} from "../../src/learning/features/bench/context"
import {
  SSE_EVENT_TYPE_CLIENT_ACTION,
  benchClientActionBroker,
  type BenchClientAction,
} from "../../src/learning/features/bench/client-actions"
import { cleanupBenchCapturesForSession } from "../../src/learning/features/bench/captures"
import { benchReadContextTool } from "../../src/learning/features/bench/tools/read-context"
import {
  BENCH_READ_CONTEXT_TAB_LIMIT,
  benchTargetAbsolutePath,
} from "../../src/learning/features/bench/model-tabs"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "session-bench-read-context"
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const TARGET = {
  type: "workspace-file",
  path: "notes.md",
  viewer: "markdown",
} satisfies BenchTarget
const TAB_KEY = "file:markdown:notes.md"

afterEach(async () => {
  clearBenchContextRegistry()
  benchClientActionBroker.reset()
  await cleanupBenchCapturesForSession(SESSION_ID)
})

async function nextAction(actions: BenchClientAction[]): Promise<BenchClientAction> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const action = actions.shift()
    if (action) return action
    await sleep(0)
  }
  throw new Error("Expected a Bench capture action.")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

describe("bench_read_context", () => {
  test("resolves selected file, live object, and revision targets to absolute paths", async () => {
    await using project = await tmpdir({ git: true })
    const objectID = "01KZGDT9V52JCFMWTSZS71DR6X"
    const revisionID = "01KZKTGCYJPQQP35GXYP744V0N"

    expect(benchTargetAbsolutePath({ directory: project.path, target: TARGET })).toBe(
      path.join(project.path, TARGET.path),
    )
    expect(
      benchTargetAbsolutePath({
        directory: project.path,
        target: {
          type: "object",
          ref: { kind: "resource", objectID, revisionID: null, itemID: null },
          viewID: "reader",
        },
      }),
    ).toBe(path.join(project.path, ".buddy/objects/v1/resource", objectID))
    expect(
      benchTargetAbsolutePath({
        directory: project.path,
        target: {
          type: "object",
          ref: { kind: "flashcard-deck", objectID, revisionID, itemID: null },
          viewID: "study",
        },
      }),
    ).toBe(
      path.join(
        project.path,
        ".buddy/objects/v1/flashcard-deck",
        objectID,
        "revisions",
        revisionID,
      ),
    )
  })

  test("does not repeat full target and routing data for a small tab list", async () => {
    await using project = await tmpdir({ git: true })
    const whiteboardObjectID = "01KZHBF7BBVW2NZ7JD1VCVAH90"
    const resourceObjectID = "01KZGDT9V52JCFMWTSZS71DR6X"
    const whiteboardTarget = {
      type: "object" as const,
      ref: {
        kind: "whiteboard" as const,
        objectID: whiteboardObjectID,
        revisionID: null,
        itemID: null,
      },
      viewID: "current",
    }
    const resourceTarget = {
      type: "object" as const,
      ref: {
        kind: "resource" as const,
        objectID: resourceObjectID,
        revisionID: null,
        itemID: null,
      },
      viewID: "reader",
    }
    const whiteboardTabKey = `object:whiteboard:${whiteboardObjectID}:current`
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: { instanceID: "compact-client", generation: 1, leaseEpoch: 1 },
        publicationSequence: 1,
        idempotencyKey: "compact-context",
        value: {
          status: "open",
          visibility: "visible",
          mode: "docked",
          selectedTabKey: whiteboardTabKey,
          tabs: [
            {
              tabKey: `object:resource:${resourceObjectID}:reader`,
              title: "Abhi Aiyer interview pack",
              target: resourceTarget,
            },
            {
              tabKey: whiteboardTabKey,
              title: "Whiteboard",
              target: whiteboardTarget,
            },
          ],
          targetKey: benchTargetKey(whiteboardTarget),
          target: {
            type: "object",
            title: "Event-driven workflows in Mastra",
            workspaceRoot: project.path,
            ref: whiteboardTarget.ref,
            viewID: whiteboardTarget.viewID,
            route: `/objects/whiteboard/${whiteboardObjectID}?view=current`,
            status: "ready",
          },
          drawer: null,
          metadata: ["element_count: 108"],
          content: "Call whiteboard_read_context with the selected objectID.",
          refs: [],
          hints: [],
        },
      },
    })

    const result = await benchReadContextTool.run(
      { responseFormat: "context_only" },
      createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_compact_context",
        agent: "buddy",
      }),
    )
    const output: unknown = JSON.parse(result.output)
    if (!isRecord(output)) throw new Error("Expected compact Bench context output.")

    expect(Object.keys(output).toSorted()).toEqual([
      "content",
      "metadata",
      "openTabCount",
      "status",
      "tabs",
      "visibility",
    ])
    expect(output.tabs).toEqual([
      {
        tabNumber: 2,
        tabKey: whiteboardTabKey,
        title: "Event-driven workflows in Mastra",
        selected: true,
        target: {
          type: "object",
          kind: "whiteboard",
          objectID: whiteboardObjectID,
          absolutePath: path.join(project.path, ".buddy/objects/v1/whiteboard", whiteboardObjectID),
          viewID: "current",
        },
      },
      {
        tabNumber: 1,
        tabKey: `object:resource:${resourceObjectID}:reader`,
        title: "Abhi Aiyer interview pack",
      },
    ])
  })

  test("returns bounded recent tabs and searches the complete internal tab list", async () => {
    await using project = await tmpdir({ git: true })
    const tabs = Array.from({ length: 30 }, (_, index) => {
      const target = {
        type: "workspace-file" as const,
        path: index === 4 ? "chapters/chapter-4.pdf" : `notes/note-${index}.md`,
        viewer: index === 4 ? ("file" as const) : ("markdown" as const),
      }
      return {
        tabKey: `file:${target.viewer}:${target.path}`,
        title: index === 4 ? "Chapter 4" : `Note ${index}`,
        target,
      }
    })
    const selectedTab = tabs[0]
    if (!selectedTab) throw new Error("Expected a selected tab fixture.")
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: { instanceID: "tab-list-client", generation: 1, leaseEpoch: 1 },
        publicationSequence: 1,
        idempotencyKey: "tab-list-context",
        value: {
          status: "open",
          visibility: "parked",
          mode: "docked",
          selectedTabKey: selectedTab.tabKey,
          tabs,
          drawer: null,
        },
      },
    })

    const read = async (tabSearch?: string): Promise<Record<string, unknown>> => {
      const result = await benchReadContextTool.run(
        {
          responseFormat: "context_only",
          ...(tabSearch ? { tabSearch } : {}),
        },
        createBuddyToolContext({
          directory: project.path,
          sessionID: SESSION_ID,
          messageID: `msg_bench_tabs_${tabSearch ?? "recent"}`,
          agent: "buddy",
        }),
      )
      const output: unknown = JSON.parse(result.output)
      if (!isRecord(output)) {
        throw new Error("Expected object Bench context output.")
      }
      return output
    }

    const recent = await read()
    expect(recent).toMatchObject({
      openTabCount: tabs.length,
      omittedTabCount: tabs.length - BENCH_READ_CONTEXT_TAB_LIMIT,
    })
    expect(recent).not.toHaveProperty("matchingTabCount")
    expect(recent).not.toHaveProperty("returnedTabCount")
    expect(Array.isArray(recent.tabs)).toBeTrue()
    if (!Array.isArray(recent.tabs)) throw new Error("Expected bounded Bench tabs.")
    expect(recent.tabs).toHaveLength(BENCH_READ_CONTEXT_TAB_LIMIT)
    expect(recent.tabs[0]).toEqual({
      tabKey: selectedTab.tabKey,
      title: selectedTab.title,
      tabNumber: 1,
      selected: true,
      target: {
        ...selectedTab.target,
        absolutePath: path.join(project.path, selectedTab.target.path),
      },
    })
    const latestTab = tabs.at(-1)
    if (!latestTab) throw new Error("Expected a latest tab fixture.")
    expect(recent.tabs).toContainEqual({
      tabKey: latestTab.tabKey,
      title: latestTab.title,
      tabNumber: tabs.length,
    })
    expect(recent.tabs).not.toContainEqual(tabs[4])

    const searched = await read("chapter 4")
    expect(searched).toMatchObject({
      openTabCount: tabs.length,
      matchingTabCount: 1,
      tabs: [
        {
          tabKey: selectedTab.tabKey,
          title: selectedTab.title,
          tabNumber: 1,
          selected: true,
          target: {
            ...selectedTab.target,
            absolutePath: path.join(project.path, selectedTab.target.path),
          },
        },
        { tabKey: tabs[4]?.tabKey, title: tabs[4]?.title, tabNumber: 5 },
      ],
    })
    expect(searched).not.toHaveProperty("returnedTabCount")
    expect(searched).not.toHaveProperty("omittedTabCount")

    const numbered = await read("tab 3")
    expect(numbered).toMatchObject({
      matchingTabCount: 1,
      tabs: [
        {
          tabKey: selectedTab.tabKey,
          title: selectedTab.title,
          tabNumber: 1,
          selected: true,
          target: {
            ...selectedTab.target,
            absolutePath: path.join(project.path, selectedTab.target.path),
          },
        },
        { tabKey: tabs[2]?.tabKey, title: tabs[2]?.title, tabNumber: 3 },
      ],
    })
  })

  test("returns either context plus a path or only the temporary Bench screenshot path", async () => {
    await using project = await tmpdir({ git: true })
    const lease = benchClientActionBroker.connectLease({
      directory: project.path,
      instanceID: "bench-read-context-client",
      generation: 1,
    })
    const actions: BenchClientAction[] = []
    const unsubscribe = benchClientActionBroker.subscribe({
      directory: project.path,
      lease,
      listener(event) {
        if (event.payload.type === SSE_EVENT_TYPE_CLIENT_ACTION) {
          actions.push(event.payload.properties.action)
        }
      },
    })
    const context = {
      status: "open" as const,
      visibility: "visible" as const,
      mode: "docked" as const,
      selectedTabKey: TAB_KEY,
      tabs: [{ tabKey: TAB_KEY, title: "notes.md", target: TARGET }],
      targetKey: benchTargetKey(TARGET),
      target: {
        type: "workspace-file" as const,
        title: "notes.md",
        workspaceRoot: project.path,
        path: TARGET.path,
        absolutePath: path.join(project.path, TARGET.path),
        route: "/_bench/markdown?path=notes.md",
        status: "ready" as const,
      },
      drawer: { kind: "skills" as const, presentation: "drawer" as const },
      metadata: ["dirty: false"],
      content: "Current Bench text.",
      refs: [],
      hints: [],
    }
    const leaseIdentity = {
      instanceID: lease.instanceID,
      generation: lease.generation,
      leaseEpoch: lease.leaseEpoch,
    }
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: leaseIdentity,
        publicationSequence: 1,
        idempotencyKey: "initial-context",
        value: context,
      },
    })

    const cases = [
      { responseFormat: "context_and_bench_screenshot", includesContext: true },
      {
        responseFormat: "bench_screenshot_only",
        includesContext: false,
        tabSearch: "ignored for screenshot-only",
      },
    ] as const
    for (const [index, testCase] of cases.entries()) {
      const run = benchReadContextTool.run(
        {
          responseFormat: testCase.responseFormat,
          ...("tabSearch" in testCase ? { tabSearch: testCase.tabSearch } : {}),
        },
        createBuddyToolContext({
          directory: project.path,
          sessionID: SESSION_ID,
          messageID: `msg_bench_read_context_${index}`,
          agent: "buddy",
        }),
      )
      const action = await nextAction(actions)
      expect(action.command).toEqual({
        type: "capture_bench_screenshot",
        tabKey: TAB_KEY,
        target: TARGET,
        drawer: "skills",
      })
      const capturedContext = {
        ...context,
        target: {
          ...context.target,
          title: `captured-notes-${index}.md`,
        },
        content: `Captured Bench text ${index}.`,
      }
      expect(
        benchClientActionBroker.completeAction({
          directory: project.path,
          actionID: action.actionID,
          completion: {
            outcome: "captured",
            lease: leaseIdentity,
            publicationSequence: index + 2,
            observedRoute: { status: "open", target: TARGET, mode: "docked" },
            observedVisibility: "visible",
            drawer: "skills",
            context: capturedContext,
            pngBase64: ONE_PIXEL_PNG_BASE64,
          },
        }),
      ).toEqual({ status: "completed" })

      const result = await run
      const output: unknown = JSON.parse(result.output)
      if (!output || typeof output !== "object" || Array.isArray(output)) {
        throw new Error("Expected object Bench capture output.")
      }
      const temporaryPath =
        "temporaryBenchScreenshotPath" in output ? output.temporaryBenchScreenshotPath : undefined
      expect(typeof temporaryPath).toBe("string")
      if (typeof temporaryPath !== "string") throw new Error("Expected capture path.")
      expect(temporaryPath).toContain("bench-capture-")
      expect(output).toMatchObject({
        capture: {
          targetKey: capturedContext.targetKey,
          title: capturedContext.target.title,
          drawer: capturedContext.drawer.kind,
        },
      })
      if (!("capture" in output) || !output.capture || typeof output.capture !== "object") {
        throw new Error("Expected capture receipt.")
      }
      if (!("capturedAt" in output.capture) || typeof output.capture.capturedAt !== "string") {
        throw new Error("Expected capture timestamp.")
      }
      expect(Number.isNaN(Date.parse(output.capture.capturedAt))).toBeFalse()
      if (testCase.includesContext) {
        expect(output).toMatchObject({
          status: "open",
          visibility: "visible",
          content: capturedContext.content,
          openTabCount: 1,
          tabs: [
            {
              tabNumber: 1,
              tabKey: TAB_KEY,
              title: capturedContext.target.title,
              selected: true,
              target: {
                ...TARGET,
                absolutePath: path.join(project.path, TARGET.path),
              },
            },
          ],
        })
        expect(output).not.toHaveProperty("targetKey")
        expect(output).not.toHaveProperty("selectedTabKey")
        expect(output).not.toHaveProperty("target")
      } else {
        expect(Object.keys(output).toSorted()).toEqual(["capture", "temporaryBenchScreenshotPath"])
      }
      expect((await fs.readFile(temporaryPath)).subarray(1, 4).toString("ascii")).toBe("PNG")
    }
    unsubscribe()
  })
})
