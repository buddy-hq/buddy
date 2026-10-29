import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness, type ConfigConformanceHarness } from "./harness-config"
import { temporaryEnvironment, type TemporaryEnvironment } from "../helpers/temporary-environment"

let harness: ConfigConformanceHarness
let watchers: TemporaryEnvironment | undefined
const sessionSchema = z.object({ id: z.string() })
const json = z.json()

describe("Context port conformance", () => {
  beforeAll(async () => {
    watchers = temporaryEnvironment({ OPENCODE_FILEWATCHER_DISABLE: "0" })
    harness = await createConfigConformanceHarness()
  })
  afterAll(async () => {
    await harness?.[Symbol.asyncDispose]()
    watchers?.[Symbol.dispose]()
  })

  test("per-prompt system context reaches the model and stays scoped to its conversation", async () => {
    const notebook = await harness.notebook("system-context")
    const first = await notebook.json("/session", sessionSchema, {
      body: { title: "System context" },
    })
    await notebook.json(`/session/${first.id}/message`, json, {
      body: {
        content: "context-system-first",
        system: "conformance-private-system",
        persona: "buddy",
      },
    })
    expect(harness.latestRequest("context-system-first").system).toContain(
      "conformance-private-system",
    )
    const second = await notebook.json("/session", sessionSchema, {
      body: { title: "Separate context" },
    })
    await notebook.json(`/session/${second.id}/message`, json, {
      body: { content: "context-system-separate", persona: "buddy" },
    })
    expect(harness.latestRequest("context-system-separate").system).not.toContain(
      "conformance-private-system",
    )
  })

  test("unchanged teaching context is sent in full again after compaction", async () => {
    const notebook = await harness.notebook("teaching-context")
    const session = await notebook.json("/session", sessionSchema, {
      body: { title: "Teaching compaction" },
    })
    const teaching = {
      active: true,
      sessionID: "conformance-lesson-context",
      lessonFilePath: "lesson.ts",
      checkpointFilePath: "checkpoint.ts",
      language: "ts",
      revision: 7,
    }
    await notebook.json(`/session/${session.id}/message`, json, {
      body: {
        content: "context-teaching-first",
        persona: "teaching-buddy",
        focusGoalIds: ["conformance-goal"],
        teaching,
      },
    })
    expect(harness.latestRequest("context-teaching-first").prompt).toContain(
      "conformance-lesson-context",
    )
    await notebook.json(`/session/${session.id}/message`, json, {
      body: {
        content: "context-teaching-unchanged",
        persona: "teaching-buddy",
        focusGoalIds: ["conformance-goal"],
        teaching,
      },
    })
    const unchanged = harness
      .latestRequest("context-teaching-unchanged")
      .prompt.split("\n")
      .findLast((message) => message.includes("context-teaching-unchanged"))
    expect(unchanged).toContain("<teaching_ctx_ref ")
    expect(unchanged).not.toContain("conformance-lesson-context")
    expect(
      await notebook.json(`/session/${session.id}/summarize`, z.boolean(), {
        body: { providerID: "scripted", modelID: "chat" },
      }),
    ).toBe(true)
    expect(
      await notebook.json(
        `/session/${session.id}/teaching-state`,
        z.object({
          persona: z.string(),
          teachingWorkspaceState: z.string(),
          focusGoalIds: z.array(z.string()),
        }),
      ),
    ).toEqual({
      persona: "teaching-buddy",
      teachingWorkspaceState: "active",
      focusGoalIds: ["conformance-goal"],
    })
    await notebook.json(`/session/${session.id}/message`, json, {
      body: {
        content: "context-teaching-after-compaction",
        persona: "teaching-buddy",
        focusGoalIds: ["conformance-goal"],
        teaching,
      },
    })
    const compacted = harness
      .latestRequest("context-teaching-after-compaction")
      .prompt.split("\n")
      .findLast((message) => message.includes("context-teaching-after-compaction"))
    expect(compacted).toContain("conformance-lesson-context")
    expect(compacted).not.toContain("<teaching_ctx_ref ")
  })

  test("the global auto-compaction setting changes compaction on a running conversation", async () => {
    const notebook = await harness.notebook("global-compaction")
    const session = await notebook.json("/session", sessionSchema, {
      body: { title: "Global compaction" },
    })
    const history = z.array(
      z.object({
        parts: z.array(
          z.object({
            type: z.string(),
            auto: z.boolean().optional(),
            status: z.string().optional(),
          }),
        ),
      }),
    )
    await harness.patchGlobalConfig({ compaction: { auto: false, reserved: 99_999 } })
    await notebook.json(`/session/${session.id}/message`, json, {
      body: { content: "context-auto-disabled", persona: "buddy" },
    })
    expect(
      (await notebook.json(`/session/${session.id}/message`, history))
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "compaction"),
    ).toEqual([])
    await harness.patchGlobalConfig({ compaction: { auto: true } })
    await notebook.json(`/session/${session.id}/message`, json, {
      body: { content: "context-auto-enabled", persona: "buddy" },
    })
    expect(
      (await notebook.json(`/session/${session.id}/message`, history)).flatMap(
        (message) => message.parts,
      ),
    ).toContainEqual(
      expect.objectContaining({ type: "compaction", auto: true, status: "completed" }),
    )
  })
})
