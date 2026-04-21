import { beforeEach, describe, expect, test } from "bun:test"
import { useWorkspaceQuestionSetPanelStore } from "../src/state/workspace-question-set-panel-store"

describe("workspace question set panel store", () => {
  beforeEach(() => {
    useWorkspaceQuestionSetPanelStore.setState({
      selectedArtifactIDByDirectory: {},
      pendingOpenByDirectory: {},
    })
  })

  test("queues and consumes a pending cross-notebook question set open", () => {
    const store = useWorkspaceQuestionSetPanelStore.getState()

    store.queueQuestionSetOpen("/target", "artifact-1")
    expect(useWorkspaceQuestionSetPanelStore.getState().pendingOpenByDirectory["/target"]).toBe(
      "artifact-1",
    )

    expect(store.consumePendingOpen("/target")).toBe("artifact-1")
    expect(useWorkspaceQuestionSetPanelStore.getState().pendingOpenByDirectory["/target"]).toBe(
      undefined,
    )
  })

  test("opening a question set clears any pending open for that directory", () => {
    const store = useWorkspaceQuestionSetPanelStore.getState()

    store.queueQuestionSetOpen("/target", "artifact-1")
    store.openQuestionSet("/target", "artifact-2")

    expect(useWorkspaceQuestionSetPanelStore.getState().pendingOpenByDirectory["/target"]).toBe(
      undefined,
    )
    expect(
      useWorkspaceQuestionSetPanelStore.getState().selectedArtifactIDByDirectory["/target"],
    ).toBe("artifact-2")
  })
})
