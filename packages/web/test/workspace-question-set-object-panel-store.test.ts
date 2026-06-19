import { beforeEach, describe, expect, test } from "bun:test"
import { useWorkspaceQuestionSetObjectPanelStore } from "../src/state/workspace-question-set-object-panel-store"

describe("workspace question set object panel store", () => {
  beforeEach(() => {
    useWorkspaceQuestionSetObjectPanelStore.setState({
      selectedObjectIDByDirectory: {},
      pendingObjectOpenByDirectory: {},
    })
  })

  test("queues and consumes a pending cross-notebook question set open", () => {
    const store = useWorkspaceQuestionSetObjectPanelStore.getState()

    store.queueQuestionSetOpen("/target", "object-1")
    expect(
      useWorkspaceQuestionSetObjectPanelStore.getState().pendingObjectOpenByDirectory["/target"],
    ).toBe(
      "object-1",
    )

    expect(store.consumePendingOpen("/target")).toBe("object-1")
    expect(
      useWorkspaceQuestionSetObjectPanelStore.getState().pendingObjectOpenByDirectory["/target"],
    ).toBe(
      undefined,
    )
  })

  test("opening a question set clears any pending open for that directory", () => {
    const store = useWorkspaceQuestionSetObjectPanelStore.getState()

    store.queueQuestionSetOpen("/target", "object-1")
    store.openQuestionSet("/target", "object-2")

    expect(
      useWorkspaceQuestionSetObjectPanelStore.getState().pendingObjectOpenByDirectory["/target"],
    ).toBe(undefined)
    expect(
      useWorkspaceQuestionSetObjectPanelStore.getState().selectedObjectIDByDirectory["/target"],
    ).toBe("object-2")
  })
})
