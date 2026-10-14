import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider, notifyManager, type InvalidateQueryFilters } from "@tanstack/react-query"
import type { ObjectQuestionSetReadQuestionsResponse } from "@buddy/sdk/types"
import type { SubagentPresentation } from "@buddy/transcript-contract/subagent"
import { QuestionSetAuthorTaskCard } from "../src/components/chat/tools/render/task/question-set-author-task-card"
import { QUESTION_SET_PRACTICE, QUESTION_SET_QUIZ } from "../src/components/chat/tools/render/task/__stories__/task-fixtures"
import type { ToolState } from "../src/components/chat/tools/types"
import { useChatStore } from "../src/state/chat-store"
import {
  applyTranscriptMessageUpdated,
  applyTranscriptPartUpdated,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import {
  objectQuestionSetPayloadQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceQuestionSetObjectsQueryOptions,
} from "../src/state/workspace-objects-query"

const DIRECTORY = "/notebook"
const LAUNCH: SubagentPresentation = { ownerSessionID: "owner", messageID: "msg_launch", callID: "call", childSessionID: "child", agentID: "question-set-author", description: "Write a quiz", background: true, workerStatus: "running", startedAt: 10 }
const LAUNCH_STATE: ToolState = { status: "completed", input: { agent: "question-set-author", description: "Write a quiz", background: true }, metadata: { sessionID: "child", status: "running" }, attachments: [], output: "The subagent is working in the background" }
const MESSAGE_BASE = { sessionID: "owner", role: "assistant", parentID: "", agent: "", mode: "", modelID: "", providerID: "", path: { cwd: DIRECTORY, root: DIRECTORY }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop" } as const

class RecordingQueryClient extends QueryClient {
  readonly invalidated: InvalidateQueryFilters[] = []

  override invalidateQueries(filters?: InvalidateQueryFilters) {
    if (filters) this.invalidated.push(filters)
    return Promise.resolve()
  }
}

function questionSet(objectID: string, title: string, sessionID: string): ObjectQuestionSetReadQuestionsResponse {
  return {
    objectID, revisionID: `${objectID}-r1`, kind: "question-set", groupType: "quiz", title, createdAt: "2026-10-08T00:00:00Z",
    createdBy: { kind: "tool", sessionID, messageID: "msg_child", callID: "save" },
    questions: [{ id: "q1", type: "mcq", prompt: "Capital of France?", goalIds: [], payload: { multipleSelect: false, choices: [{ id: "a", content: "Paris" }] } }],
  }
}

async function flushEffects() {
  for (let turn = 0; turn < 3; turn++) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  }
}

describe("subagent author card", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: RecordingQueryClient

  beforeEach(() => {
    useChatStore.getState().resetRuntimeState()
    resetTranscriptRepositoryForTests()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    notifyManager.setNotifyFunction((callback) => {
      act(callback)
    })
    queryClient = new RecordingQueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(workspaceQuestionSetObjectsQueryOptions(DIRECTORY).queryKey, { objects: [QUESTION_SET_QUIZ, QUESTION_SET_PRACTICE], loadErrors: [] })
    queryClient.setQueryData(objectQuestionSetPayloadQueryOptions({ directory: DIRECTORY, objectID: QUESTION_SET_QUIZ.objectID }).queryKey, questionSet(QUESTION_SET_QUIZ.objectID, "Child quiz", "child"))
    queryClient.setQueryData(objectQuestionSetPayloadQueryOptions({ directory: DIRECTORY, objectID: QUESTION_SET_PRACTICE.objectID }).queryKey, questionSet(QUESTION_SET_PRACTICE.objectID, "Unrelated practice", "other-child"))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    applyTranscriptMessageUpdated(DIRECTORY, { ...MESSAGE_BASE, id: "msg_launch", time: { created: 10, completed: 15 } })
    applyTranscriptPartUpdated(DIRECTORY, { id: "prt_msg_launch_00000000_tool%3Acall", sessionID: "owner", messageID: "msg_launch", type: "tool", tool: "subagent", callID: "call", state: LAUNCH_STATE, subagent: LAUNCH })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    queryClient.clear()
    notifyManager.setNotifyFunction((callback) => {
      callback()
    })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("shows only the child's saved object after worker completion, not at background launch", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <QuestionSetAuthorTaskCard directory={DIRECTORY} subagent={LAUNCH} state={LAUNCH_STATE} />
        </QueryClientProvider>,
      )
      await flushEffects()
    })
    expect(container.textContent).toContain("Waiting for result")
    expect(container.textContent).not.toContain("Child quiz")
    expect(queryClient.invalidated).toEqual([])

    await act(async () => {
      applyTranscriptMessageUpdated(DIRECTORY, { ...MESSAGE_BASE, id: "msg_done", kind: "synthetic", time: { created: 20, completed: 20 } })
      applyTranscriptPartUpdated(DIRECTORY, { id: "prt_msg_done_00000000_notice", sessionID: "owner", messageID: "msg_done", type: "notice", text: "Subagent completed: Write a quiz", source: "subagent", status: "completed", completion: { ownerSessionID: "owner", childSessionID: "child", messageID: "msg_done", createdAt: 20, description: "Write a quiz", outcome: "completed", result: "Saved quiz" } })
      await flushEffects()
    })
    expect(container.textContent).toContain("Child quiz")
    expect(container.textContent).not.toContain("Unrelated practice")
    expect(container.textContent).not.toContain("<subagent")
    expect(queryClient.invalidated).toEqual([{ queryKey: workspaceObjectsQueryKeys.all(DIRECTORY), refetchType: "active" }])
  })

  test("falls back to the XML-free worker result when the child saved nothing", async () => {
    queryClient.setQueryData(workspaceQuestionSetObjectsQueryOptions(DIRECTORY).queryKey, { objects: [QUESTION_SET_PRACTICE], loadErrors: [] })
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <QuestionSetAuthorTaskCard directory={DIRECTORY} subagent={{ ...LAUNCH, background: false, workerStatus: "completed", result: "Could not find enough material" }} state={{ ...LAUNCH_STATE, output: "<subagent sessionID=\"child\" state=\"completed\">\nCould not find enough material\n</subagent>" }} />
        </QueryClientProvider>,
      )
      await flushEffects()
    })
    expect(container.textContent).toContain("Could not find enough material")
    expect(container.textContent).not.toContain("<subagent")
    expect(container.textContent).not.toContain("Unrelated practice")
  })
})
