import { beforeEach, describe, expect, test } from "bun:test"
import { useWorkspaceFilePanelStore } from "../src/state/workspace-file-panel-store"

const workspaceItem = {
  path: "generated/deck.pptx",
}

const readerItem = {
  path: "generated/notes.pdf",
}

const queuedItemWithAbsolutePath = {
  path: "./generated/slides.pdf",
  absolutePath: "/repo/generated/slides.pdf",
}

describe("workspace file panel store", () => {
  beforeEach(() => {
    useWorkspaceFilePanelStore.setState({
      selectedPathByDirectory: {},
      selectedItemByDirectory: {},
      pendingOpenByDirectory: {},
      pendingAutoOpenByDirectory: {},
    })
  })

  test("queues and consumes a pending file open", () => {
    const store = useWorkspaceFilePanelStore.getState()

    store.queueFileOpen("/target", workspaceItem)
    expect(useWorkspaceFilePanelStore.getState().pendingOpenByDirectory["/target"]).toEqual(
      workspaceItem,
    )

    expect(store.consumePendingOpen("/target")).toEqual(workspaceItem)
    expect(useWorkspaceFilePanelStore.getState().pendingOpenByDirectory["/target"]).toBe(undefined)
  })

  test("opening a file clears pending open for that directory", () => {
    const store = useWorkspaceFilePanelStore.getState()

    store.queueFileOpen("/target", workspaceItem)
    store.openFile("/target", readerItem)

    expect(useWorkspaceFilePanelStore.getState().pendingOpenByDirectory["/target"]).toBe(undefined)
    expect(useWorkspaceFilePanelStore.getState().selectedPathByDirectory["/target"]).toBe(
      "generated/notes.pdf",
    )
  })

  test("queues and consumes a pending auto-open request", () => {
    const store = useWorkspaceFilePanelStore.getState()

    store.queueFileOpen("/target", readerItem, { autoOpen: true })

    expect(store.consumePendingAutoOpen("/target")).toEqual(readerItem)
    expect(useWorkspaceFilePanelStore.getState().pendingAutoOpenByDirectory["/target"]).toBe(
      undefined,
    )
  })

  test("normalizes queued paths and preserves absolute paths", () => {
    const store = useWorkspaceFilePanelStore.getState()

    store.queueFileOpen("/target", queuedItemWithAbsolutePath, { autoOpen: true })
    const queued = useWorkspaceFilePanelStore.getState().pendingOpenByDirectory["/target"]

    expect(queued).toEqual({
      path: "generated/slides.pdf",
      absolutePath: "/repo/generated/slides.pdf",
    })

    store.openFile("/target", queuedItemWithAbsolutePath)

    expect(useWorkspaceFilePanelStore.getState().selectedItemByDirectory["/target"]).toEqual({
      path: "generated/slides.pdf",
      absolutePath: "/repo/generated/slides.pdf",
    })
  })
})
