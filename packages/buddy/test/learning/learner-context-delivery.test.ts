import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import {
  createLearnerMemory,
  listLearnerMemories,
  LearnerMemoryPath,
} from "../../src/learning/learner-memory"
import { orchestrateSessionMessageTransform } from "../../src/learning/agent-execution/transforms/message-transform-orchestration"
import { readTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

async function createPromptBody() {
  return {
    content: "Help me think through this change",
    persona: "buddy",
  } satisfies Record<string, unknown>
}

describe("learner context delivery", () => {
  test("emits bootstrap learner context on first delivery", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    await createLearnerMemory({
      directory: project.path,
      type: "preference",
      title: "Concrete examples first",
      body: "Prefers concrete implementation examples before abstraction.",
      tags: ["teaching-style"],
      projectPath: project.path,
      source: "learner_authored",
      reason: "bootstrap test",
    })

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_bootstrap",
      },
      body: await createPromptBody(),
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    expect(parts[0]?.type).toBe("text")
    expect(parts[0]?.text).toContain("<learner_context fingerprint=")
    expect(parts[0]?.text).toContain("Learner profile:")
    expect(parts[0]?.text).toContain("Concrete examples first")
    expect(result.learnerContextDelivery?.kind).toBe("bootstrap")
  })

  test("does not emit learner context when the delivered fingerprint has not changed", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const first = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_no_change",
      },
      body: await createPromptBody(),
      projectConfig: config,
    })

    const second = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_no_change",
      },
      body: await createPromptBody(),
      projectConfig: config,
      previousState: {
        sessionId: "ses_no_change",
        persona: "buddy",
        currentSurface: "chat",
        workspaceState: "chat",
        focusGoalIds: [],
        learnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextItems: first.learnerContextDelivery?.items,
      },
    })

    const parts = second.transformed.parts as Array<Record<string, unknown>>
    expect(
      parts.some((part) => typeof part.text === "string" && part.text.includes("<learner_context")),
    ).toBe(false)
    expect(
      parts.some(
        (part) => typeof part.text === "string" && part.text.includes("<learner_context_delta"),
      ),
    ).toBe(false)
    expect(second.learnerContextDelivery).toBeUndefined()
  })

  test("emits a learner context delta after learner memory changes", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const first = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_delta",
      },
      body: await createPromptBody(),
      projectConfig: config,
    })

    await createLearnerMemory({
      directory: project.path,
      type: "goal",
      title: "Implement bridge validation",
      body: "Finish one concrete Electron bridge validation task with structured errors.",
      tags: ["electron", "validation"],
      projectPath: project.path,
      source: "learner_authored",
      reason: "delta test",
    })

    const second = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_delta",
      },
      body: await createPromptBody(),
      projectConfig: config,
      previousState: {
        sessionId: "ses_delta",
        persona: "buddy",
        currentSurface: "chat",
        workspaceState: "chat",
        focusGoalIds: [],
        learnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextItems: first.learnerContextDelivery?.items,
      },
    })

    const parts = second.transformed.parts as Array<Record<string, unknown>>
    const deltaText = parts.find(
      (part) => typeof part.text === "string" && part.text.includes("<learner_context_delta"),
    )?.text
    expect(deltaText).toContain("<learner_context_delta")
    expect(deltaText).toContain("Added:")
    expect(deltaText).toContain("Goal: Implement bridge validation")
    expect(second.learnerContextDelivery?.kind).toBe("delta")
  })

  test("preserves delta delivery after an unchanged intermediate turn", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const first = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_delta_after_noop",
      },
      body: await createPromptBody(),
      projectConfig: config,
    })

    const unchanged = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_delta_after_noop",
      },
      body: await createPromptBody(),
      projectConfig: config,
      previousState: {
        sessionId: "ses_delta_after_noop",
        persona: "buddy",
        currentSurface: "chat",
        workspaceState: "chat",
        focusGoalIds: [],
        learnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextItems: first.learnerContextDelivery?.items,
      },
    })

    await createLearnerMemory({
      directory: project.path,
      type: "goal",
      title: "Add one validation checkpoint",
      body: "Finish a concrete validation checkpoint task.",
      tags: ["validation"],
      projectPath: project.path,
      source: "learner_authored",
      reason: "delta after noop test",
    })

    const second = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_delta_after_noop",
      },
      body: await createPromptBody(),
      projectConfig: config,
      previousState: {
        sessionId: "ses_delta_after_noop",
        persona: "buddy",
        currentSurface: "chat",
        workspaceState: "chat",
        focusGoalIds: [],
        learnerContextDigest:
          unchanged.learnerContextDelivery?.fingerprint ??
          first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextDigest: first.learnerContextDelivery?.fingerprint,
        lastDeliveredLearnerContextItems: first.learnerContextDelivery?.items,
      },
    })

    const parts = second.transformed.parts as Array<Record<string, unknown>>
    const deltaText = parts.find(
      (part) => typeof part.text === "string" && part.text.includes("<learner_context_delta"),
    )?.text
    expect(deltaText).toContain("<learner_context_delta")
    expect(deltaText).toContain("Added:")
    expect(second.learnerContextDelivery?.kind).toBe("delta")
  })

  test("records learner context delivery only after the transformed prompt is accepted", async () => {
    await using project = await tmpdir({ git: true })

    const result = await orchestrateSessionMessageTransform({
      context: {
        directory: project.path,
        sessionID: "ses_accept",
        request: new Request("http://localhost"),
      },
      body: await createPromptBody(),
    })

    await result.onAccepted?.()

    const state = readTeachingSessionState(project.path, "ses_accept")
    expect(state?.lastDeliveredLearnerContextDigest).toBeDefined()
    expect(state?.lastDeliveredLearnerContextItems).toBeDefined()
    expect(state?.lastDeliveredLearnerContextMessageId).toBeDefined()

    const eventFile = LearnerMemoryPath.eventFile(
      project.path,
      new Date().toISOString().slice(0, 7),
    )
    const file = await Bun.file(eventFile).text()
    expect(file).toContain('"type":"learner_context_delivered"')
    expect(file).toContain('"deliveryKind":"bootstrap"')
  })

  test("accepted delivery does not create or strengthen learner memories", async () => {
    await using project = await tmpdir({ git: true })

    const memory = await createLearnerMemory({
      directory: project.path,
      type: "preference",
      title: "Concrete examples first",
      body: "Prefers concrete implementation examples before abstraction.",
      tags: ["teaching-style"],
      projectPath: project.path,
      source: "learner_authored",
      reason: "delivery side-effect test",
    })

    const result = await orchestrateSessionMessageTransform({
      context: {
        directory: project.path,
        sessionID: "ses_no_strengthen",
        request: new Request("http://localhost"),
      },
      body: await createPromptBody(),
    })

    await result.onAccepted?.()

    const updated = (await listLearnerMemories(project.path)).find(
      (candidate) => candidate.id === memory.id,
    )
    expect(updated?.strength).toBe(memory.strength)
    expect(updated?.lastUsedAt).toBe(memory.lastUsedAt)
  })
})
