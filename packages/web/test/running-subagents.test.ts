import { describe, expect, test } from "bun:test"
import type { SubagentCompletion, SubagentPresentation } from "@buddy/transcript-contract/subagent"
import {
  completionForSubagent,
  completionSettlesSubagent,
  deriveRunningSubagents,
  subagentCompletions,
  subagentRunStatus,
  type RunningSubagentsInput,
} from "../src/lib/running-subagents"
import type { AssistantMessageInfo, MessageWithParts, SessionStatusInfo } from "../src/state/chat-types"

const BUSY: SessionStatusInfo = { type: "busy" }
const IDLE: SessionStatusInfo = { type: "idle" }
const background: SubagentPresentation = { ownerSessionID: "owner", messageID: "msg_launch", callID: "call", childSessionID: "child", agentID: "general", description: "Research", background: true, workerStatus: "running", startedAt: 10 }
const info: AssistantMessageInfo = { id: "msg_launch", sessionID: "owner", role: "assistant", time: { created: 10 }, parentID: "", agent: "buddy", mode: "buddy", modelID: "model", providerID: "test", path: { cwd: "/notebook", root: "/notebook" }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }

function launch(overrides: Partial<SubagentPresentation> = {}, toolStatus = "completed"): MessageWithParts {
  const subagent = { ...background, ...overrides }
  return { info: { ...info, id: subagent.messageID, time: { created: subagent.startedAt } }, parts: [{ id: `prt_${subagent.messageID}_${subagent.callID}`, messageID: subagent.messageID, sessionID: "owner", type: "tool", tool: "subagent", callID: subagent.callID, state: { status: toolStatus, input: {}, metadata: { sessionID: subagent.childSessionID, status: "running" } }, subagent }] }
}

function notice(outcome: SubagentCompletion["outcome"] = "completed", createdAt = 20, messageID = "msg_done", childSessionID = "child"): MessageWithParts {
  const completion: SubagentCompletion = { ownerSessionID: "owner", childSessionID, messageID, createdAt, description: "Research", outcome, result: `Finished ${messageID}` }
  return { info: { ...info, id: messageID, kind: "synthetic", time: { created: createdAt } }, parts: [{ id: `prt_${messageID}_00000000_notice`, messageID, sessionID: "owner", type: "notice", text: "Subagent completed: Research", source: "subagent", completion }] }
}

function derive(messages: MessageWithParts[], extras: Partial<RunningSubagentsInput> = {}) {
  return deriveRunningSubagents({ ownerSessionID: "owner", messages, sessions: [{ id: "child", parentID: "owner", title: "Research" }], sessionStatusByID: {}, ...extras })
}

describe("running subagents", () => {
  test("keeps a successful background launch distinct from a running worker", () => {
    expect(derive([launch()], { sessionStatusByID: { child: BUSY } })).toEqual([{ childSessionID: "child", description: "Research", agentID: "general", status: "running", blocking: false }])
    expect(derive([launch()], { sessionStatusByID: { child: IDLE } })).toEqual([{ childSessionID: "child", description: "Research", agentID: "general", status: "waiting", blocking: false }])
    expect(derive([launch({ background: false, workerStatus: "completed" })])).toEqual([])
  })

  test("shows a blocking call only while its child is active", () => {
    const blocking = launch({ background: false }, "running")
    expect(derive([blocking], { sessionStatusByID: { child: BUSY } })).toMatchObject([{ childSessionID: "child", status: "running", blocking: true }])
    expect(derive([blocking], { sessionStatusByID: { child: IDLE } })).toEqual([])
    expect(subagentRunStatus({ ...background, background: false }, undefined, false)).toBe("running")
  })

  test("a blocking launch moved to the background is no longer blocking", () => {
    const promoted = launch({ background: true }, "completed")
    expect(derive([promoted], { sessionStatusByID: { child: BUSY } })).toMatchObject([{ childSessionID: "child", status: "running", blocking: false }])
  })

  test("a child known only from the session list is never offered as blocking", () => {
    expect(derive([], { sessionStatusByID: { child: BUSY } })).toEqual([{ childSessionID: "child", description: "Research", status: "running", blocking: false }])
  })

  test.each(["completed", "error", "cancelled"] as const)("removes %s work and attributes one completion notice to the launch", (outcome) => {
    const messages = [launch(), notice(outcome), notice(outcome)]
    expect(derive(messages, { sessionStatusByID: { child: IDLE } })).toEqual([])
    expect(subagentCompletions(messages)).toHaveLength(1)
    const completion = completionForSubagent(messages, background)
    expect(completion).toMatchObject({ outcome, messageID: "msg_done" })
    expect(subagentRunStatus(background, completion, false)).toBe(outcome)
  })

  test("accepts a completion that arrives before the parent tool succeeds", () => {
    const pending = launch({}, "running")
    expect(derive([pending], { sessionStatusByID: { child: BUSY } })).toMatchObject([{ status: "running" }])
    expect(derive([pending, notice()], { sessionStatusByID: { child: IDLE } })).toEqual([])
    expect(derive([launch(), notice()], { sessionStatusByID: { child: IDLE } })).toEqual([])
  })

  test("starts a new run for a reused child after its earlier terminal notice", () => {
    const next = { ...background, messageID: "msg_next", startedAt: 30 }
    const messages = [launch(), notice(), launch(next)]
    expect(derive(messages, { sessionStatusByID: { child: BUSY } })).toMatchObject([{ childSessionID: "child", status: "running" }])
    expect(derive(messages, { sessionStatusByID: { child: IDLE } })).toMatchObject([{ status: "waiting" }])
    expect(completionForSubagent(messages, background)?.messageID).toBe("msg_done")
    expect(completionForSubagent(messages, next)).toBeUndefined()
    const finished = [...messages, notice("error", 40, "msg_next_done")]
    expect(derive(finished, { sessionStatusByID: { child: IDLE } })).toEqual([])
    expect(completionForSubagent(finished, next)).toMatchObject({ messageID: "msg_next_done", outcome: "error" })
  })

  test("keeps an earlier background launch completed while its child runs a continuation", () => {
    const next = { ...background, messageID: "msg_next", startedAt: 30 }
    const messages = [launch(), notice(), launch(next)]
    const completion = completionForSubagent(messages, background)
    expect(completion).toMatchObject({ outcome: "completed" })
    expect(subagentRunStatus(background, completion, true, completionSettlesSubagent(messages, background))).toBe("completed")
  })

  test("does not let a late prior completion hide an active continuation", () => {
    const next = { ...background, messageID: "msg_next", startedAt: 30 }
    const messages = [launch(), launch(next), notice("completed", 35)]
    expect(derive(messages, { sessionStatusByID: { child: BUSY } })).toMatchObject([{ status: "running" }])
    expect(subagentRunStatus(next, completionForSubagent(messages, next), true)).toBe("running")
    expect(completionSettlesSubagent(messages, next)).toBe(false)
  })

  test("joins continuations of one active child into one worker and dedups the session inventory", () => {
    const messages = [launch(), launch({ callID: "joined" })]
    expect(derive(messages, { sessionStatusByID: { child: BUSY } })).toHaveLength(1)
    const done = [...messages, notice()]
    expect(completionForSubagent(done, { ...background, callID: "joined" })?.messageID).toBe("msg_done")
    expect(completionForSubagent(done, background)?.messageID).toBe("msg_done")
  })

  test("discovers active children whose launch or progress is missing from loaded history", () => {
    const sessions = [{ id: "child", parentID: "owner", title: "Child work" }, { id: "unrelated", parentID: "other", title: "Other work" }, { id: "idle", parentID: "owner", title: "Idle work" }]
    expect(derive([], { sessions, sessionStatusByID: { child: BUSY, unrelated: BUSY, idle: IDLE } })).toEqual([{ childSessionID: "child", description: "Child work", status: "running", blocking: false }])
    expect(derive([launch({ childSessionID: undefined })], { sessions, sessionStatusByID: { child: BUSY } })).toEqual([{ childSessionID: "child", description: "Child work", status: "running", blocking: false }])
  })

  test("resolves a waiting worker once reconnect reloads the authoritative completion", () => {
    expect(derive([launch()], { sessionStatusByID: { child: IDLE } })).toMatchObject([{ status: "waiting" }])
    expect(derive([launch(), notice()], { sessionStatusByID: { child: IDLE } })).toEqual([])
    expect(derive([notice()], { sessionStatusByID: { child: IDLE } })).toEqual([])
  })
})
