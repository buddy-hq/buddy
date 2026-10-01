import { beforeEach, describe, expect, test } from "bun:test"
import {
  readWorkspaceDrawerUiState,
  useWorkspaceDrawerUiState,
  workspaceDrawerUiKey,
  writeWorkspaceDrawerUiState,
} from "../src/state/workspace-drawer-ui-state"

const DIRECTORY = "/workspace/drawer-ui"
const OTHER_DIRECTORY = "/workspace/other"

describe("workspace drawer UI state", () => {
  beforeEach(() => {
    useWorkspaceDrawerUiState.setState({ byKey: {} })
  })

  test("scopes state to a directory and drawer", () => {
    const sources = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "sources" })
    const boards = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "boards" })

    writeWorkspaceDrawerUiState(sources, { scrollTop: 120 })

    expect(readWorkspaceDrawerUiState(sources)?.scrollTop).toBe(120)
    expect(readWorkspaceDrawerUiState(boards)).toBeUndefined()
  })

  test("merges partial writes so scroll and expansion do not overwrite each other", () => {
    const explorer = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "explorer" })

    writeWorkspaceDrawerUiState(explorer, { expandedPaths: ["docs", "docs/guides"] })
    writeWorkspaceDrawerUiState(explorer, { scrollTop: 64 })

    expect(readWorkspaceDrawerUiState(explorer)).toEqual({
      expandedPaths: ["docs", "docs/guides"],
      scrollTop: 64,
    })
  })

  test("retains search and creation filter independently across drawer remounts", () => {
    const notes = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "notes" })
    const creations = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "creations" })

    writeWorkspaceDrawerUiState(notes, { search: "meeting" })
    writeWorkspaceDrawerUiState(creations, { search: "diagram", creationFilter: "diagrams" })
    writeWorkspaceDrawerUiState(creations, { scrollTop: 42 })

    expect(readWorkspaceDrawerUiState(notes)?.search).toBe("meeting")
    expect(readWorkspaceDrawerUiState(creations)).toEqual({
      search: "diagram",
      creationFilter: "diagrams",
      scrollTop: 42,
    })
  })

  test("clears one notebook without touching another", () => {
    const kept = workspaceDrawerUiKey({ directory: OTHER_DIRECTORY, drawer: "sources" })
    const cleared = workspaceDrawerUiKey({ directory: DIRECTORY, drawer: "sources" })
    writeWorkspaceDrawerUiState(kept, { scrollTop: 10 })
    writeWorkspaceDrawerUiState(cleared, { scrollTop: 20 })

    useWorkspaceDrawerUiState.getState().clearDirectory(DIRECTORY)

    expect(readWorkspaceDrawerUiState(cleared)).toBeUndefined()
    expect(readWorkspaceDrawerUiState(kept)?.scrollTop).toBe(10)
  })
})
