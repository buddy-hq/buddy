import { describe, expect, test } from "bun:test"
import { resolveRightWorkspaceWidth } from "../src/lib/directory-chat/right-sidebar-layout"
import { resolveRightWorkspaceSelector } from "../src/lib/directory-chat/right-workspace-policy"
import { useUiPreferences } from "../src/state/ui-preferences"

const DIRECTORY = "/tmp/notebook"

describe("right workspace policy", () => {
  test("never mounts a selector while a Bench target is parked", () => {
    expect(
      resolveRightWorkspaceSelector({
        workspaceOpen: false,
        hasBenchTarget: true,
        activeSelector: undefined,
        fallbackSelector: "library",
        fallbackSelectorSuppressed: false,
      }),
    ).toBeUndefined()
  })

  test("restores Bench without opening the fallback selector", () => {
    expect(
      resolveRightWorkspaceSelector({
        workspaceOpen: true,
        hasBenchTarget: true,
        activeSelector: undefined,
        fallbackSelector: "explorer",
        fallbackSelectorSuppressed: false,
      }),
    ).toBeUndefined()
  })

  test("opens the remembered selector when no Bench target is parked", () => {
    expect(
      resolveRightWorkspaceSelector({
        workspaceOpen: true,
        hasBenchTarget: false,
        activeSelector: undefined,
        fallbackSelector: "library",
        fallbackSelectorSuppressed: false,
      }),
    ).toBe("library")
  })

  test("clamps legacy sidebar widths to right-workspace bounds", () => {
    expect(resolveRightWorkspaceWidth(120)).toBe(240)
    expect(resolveRightWorkspaceWidth(380)).toBe(380)
    expect(resolveRightWorkspaceWidth(820)).toBe(520)
  })

  test("activating Bench selects it and reopens an explicitly closed workspace", () => {
    const previousOpen = useUiPreferences.getState().rightSidebarOpen
    const previousSurfaces = useUiPreferences.getState().rightWorkspaceSurfaceByDirectory

    try {
      useUiPreferences.setState({
        rightSidebarOpen: false,
        rightWorkspaceSurfaceByDirectory: {
          [DIRECTORY]: "library",
        },
      })

      useUiPreferences.getState().activateRightWorkspaceSurface(DIRECTORY, "bench")

      expect(useUiPreferences.getState().rightSidebarOpen).toBe(true)
      expect(useUiPreferences.getState().rightWorkspaceSurfaceByDirectory[DIRECTORY]).toBe("bench")
    } finally {
      useUiPreferences.setState({
        rightSidebarOpen: previousOpen,
        rightWorkspaceSurfaceByDirectory: previousSurfaces,
      })
    }
  })

  test("closing Bench clears the active surface and collapses the workspace", () => {
    const previousOpen = useUiPreferences.getState().rightSidebarOpen
    const previousSurfaces = useUiPreferences.getState().rightWorkspaceSurfaceByDirectory

    try {
      useUiPreferences.setState({
        rightSidebarOpen: true,
        rightWorkspaceSurfaceByDirectory: {
          [DIRECTORY]: "bench",
        },
      })

      useUiPreferences.getState().closeRightWorkspace(DIRECTORY)

      expect(useUiPreferences.getState().rightSidebarOpen).toBe(false)
      expect(useUiPreferences.getState().rightWorkspaceSurfaceByDirectory[DIRECTORY]).toBeUndefined()
    } finally {
      useUiPreferences.setState({
        rightSidebarOpen: previousOpen,
        rightWorkspaceSurfaceByDirectory: previousSurfaces,
      })
    }
  })
})
