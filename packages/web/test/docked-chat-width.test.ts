import { beforeEach, describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  resolveBenchLayoutProfile,
  type BenchLayoutProfileID,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "../src/lib/directory-chat/right-workspace-layout"
import {
  resolveDraggedDockedChatWidth,
  resolveWorkspacePresentation,
} from "../src/lib/directory-chat/workspace-presentation"
import {
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
} from "../src/state/directory-workspace-store"
import { UI_PREFERENCES_STORAGE_KEY, useUiPreferences } from "../src/state/ui-preferences"
import { parsePersistedStoreState } from "./parse-test-values"

const WIDE_VIEWPORT = { widthPx: 1_440, heightPx: 900, safeTopPx: 0 }
const NARROW_VIEWPORT = { widthPx: 800, heightPx: 700, safeTopPx: 0 }
const SIDEBAR_FIT_VIEWPORT = { widthPx: 1_360, heightPx: 900, safeTopPx: 0 }
const GROWN_VIEWPORT = { widthPx: 1_600, heightPx: 900, safeTopPx: 0 }
const RESOURCE_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
const BROWSER_TARGET = {
  type: "browser",
  tabID: "tab-1",
  url: "https://example.com",
} satisfies BenchTarget

function dockedChat(input: {
  target?: BenchTarget
  viewport?: typeof WIDE_VIEWPORT
  requestedBenchWidthPx: number | null
  rememberedDockedChatWidthPx?: number | null
  leftSidebarPreferredOpen?: boolean
  leftSidebarWidthPx?: number
  layoutProfile?: BenchLayoutProfileID
}) {
  const viewport = input.viewport ?? WIDE_VIEWPORT
  const leftSidebarWidthPx = input.leftSidebarWidthPx ?? 280
  const route = (
    input.target
      ? {
          status: "open",
          target: input.target,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
        }
      : { status: "closed" }
  ) satisfies BenchRouteSnapshot
  const presentation = resolveWorkspacePresentation({
    projection: effectiveWorkspaceProjection(
      route,
      { docked: createExpandedWorkspaceState(null), lastDrawer: "sources" },
      null,
    ),
    hydrated: true,
    layoutProfile:
      input.layoutProfile ??
      (input.target ? resolveBenchLayoutProfile(input.target) : BENCH_LAYOUT_PROFILE_DOCUMENT),
    viewport,
    requestedWorkspaceWidthPx: null,
    requestedBenchWidthPx: input.requestedBenchWidthPx,
    rememberedDockedChatWidthPx: input.rememberedDockedChatWidthPx ?? null,
    leftSidebarPreferredOpen: input.leftSidebarPreferredOpen ?? false,
    leftSidebarWidthPx,
  })
  const shellWidthPx = presentation.leftSidebar.visible
    ? viewport.widthPx - leftSidebarWidthPx
    : viewport.widthPx

  return {
    workspaceWidthPx: presentation.workspace.widthPx,
    minWidthPx: presentation.workspace.minWidthPx,
    maxWidthPx: presentation.workspace.maxWidthPx,
    chatWidthPx: shellWidthPx - presentation.workspace.widthPx,
    sidebarVisible: presentation.leftSidebar.visible,
  }
}

function draggedChat(input: {
  profile: BenchLayoutProfileID
  layout: "shell" | "collection"
  viewport?: typeof WIDE_VIEWPORT
  rawWorkspaceWidthPx: number
  workspaceMinWidthPx: number
  workspaceMaxWidthPx: number
  leftSidebarVisible: boolean
  hasVisibleBenchTarget: boolean
}) {
  return resolveDraggedDockedChatWidth({
    viewport: input.viewport ?? WIDE_VIEWPORT,
    profile: input.profile,
    workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
    layout: input.layout,
    leftSidebarVisible: input.leftSidebarVisible,
    leftSidebarWidthPx: 280,
    rawWorkspaceWidthPx: input.rawWorkspaceWidthPx,
    workspaceMinWidthPx: input.workspaceMinWidthPx,
    workspaceMaxWidthPx: input.workspaceMaxWidthPx,
    hasVisibleBenchTarget: input.hasVisibleBenchTarget,
    applyResizeIntent: true,
  })
}

describe("docked chat width", () => {
  test("opens an untouched docked chat 80px wider than the previous first-open width", () => {
    const resource = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: null,
    })
    const browser = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: null,
    })

    expect(resource.chatWidthPx).toBe(936)
    expect(resource.workspaceWidthPx).toBe(504)
    expect(browser.chatWidthPx).toBe(696)
    expect(browser.workspaceWidthPx).toBe(744)
  })

  test("keeps a previously saved bench width until the chat width itself is remembered", () => {
    const savedBench = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: 420,
    })
    const remembered = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: 420,
      rememberedDockedChatWidthPx: 640,
    })

    expect(savedBench.workspaceWidthPx).toBe(420)
    expect(remembered.chatWidthPx).toBe(640)
    expect(remembered.workspaceWidthPx).toBe(800)
  })

  test("clamps a remembered chat width to the panel minimum and maximum", () => {
    const tooNarrow = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: null,
      rememberedDockedChatWidthPx: 100,
    })
    const tooWide = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: null,
      rememberedDockedChatWidthPx: 2_000,
    })
    const besideSidebar = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: null,
      rememberedDockedChatWidthPx: 500,
      leftSidebarPreferredOpen: true,
      leftSidebarWidthPx: 280,
    })
    const narrowWindow = dockedChat({
      target: RESOURCE_TARGET,
      viewport: NARROW_VIEWPORT,
      requestedBenchWidthPx: null,
    })

    expect(tooNarrow.chatWidthPx).toBe(389)
    expect(tooNarrow.workspaceWidthPx).toBe(1_051)
    expect(tooWide.chatWidthPx).toBe(1_036)
    expect(tooWide.workspaceWidthPx).toBe(404)
    expect(besideSidebar.sidebarVisible).toBe(true)
    expect(besideSidebar.chatWidthPx).toBe(500)
    expect(besideSidebar.workspaceWidthPx).toBe(660)
    expect(narrowWindow.chatWidthPx).toBe(396)
    expect(narrowWindow.workspaceWidthPx).toBe(404)
  })

  test("saves the chat width a drag shows after it hides the sidebar", () => {
    const browserProfile = resolveBenchLayoutProfile(BROWSER_TARGET)
    const start = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: 700,
      leftSidebarPreferredOpen: true,
    })
    const saved = draggedChat({
      profile: browserProfile,
      layout: "shell",
      rawWorkspaceWidthPx: 880,
      workspaceMinWidthPx: start.minWidthPx,
      workspaceMaxWidthPx: start.maxWidthPx,
      leftSidebarVisible: start.sidebarVisible,
      hasVisibleBenchTarget: true,
    })
    const continued = draggedChat({
      profile: browserProfile,
      layout: "shell",
      rawWorkspaceWidthPx: 900,
      workspaceMinWidthPx: start.minWidthPx,
      workspaceMaxWidthPx: start.maxWidthPx,
      leftSidebarVisible: start.sidebarVisible,
      hasVisibleBenchTarget: true,
    })
    const settled = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: 880,
      rememberedDockedChatWidthPx: saved,
      leftSidebarPreferredOpen: true,
    })

    expect(start.sidebarVisible).toBe(true)
    expect(start.workspaceWidthPx).toBe(700)
    expect(start.chatWidthPx).toBe(460)
    expect(start.maxWidthPx).toBe(840)
    expect(saved).toBe(560)
    expect(continued).toBe(540)
    expect(settled.sidebarVisible).toBe(false)
    expect(settled.workspaceWidthPx).toBe(880)
    expect(settled.chatWidthPx).toBe(560)
  })

  test("fits a pinned sidebar to the first-open browser width", () => {
    const hidden = dockedChat({
      target: BROWSER_TARGET,
      viewport: SIDEBAR_FIT_VIEWPORT,
      requestedBenchWidthPx: null,
      leftSidebarPreferredOpen: false,
    })
    const pinned = dockedChat({
      target: BROWSER_TARGET,
      viewport: SIDEBAR_FIT_VIEWPORT,
      requestedBenchWidthPx: null,
      leftSidebarPreferredOpen: true,
    })
    const obsoleteBench = dockedChat({
      target: BROWSER_TARGET,
      viewport: GROWN_VIEWPORT,
      requestedBenchWidthPx: 1_200,
      rememberedDockedChatWidthPx: 640,
      leftSidebarPreferredOpen: true,
    })

    expect(hidden.sidebarVisible).toBe(false)
    expect(hidden.workspaceWidthPx).toBe(744)
    expect(hidden.chatWidthPx).toBe(616)
    expect(pinned.sidebarVisible).toBe(true)
    expect(pinned.workspaceWidthPx).toBe(744)
    expect(pinned.chatWidthPx).toBe(336)
    expect(obsoleteBench.sidebarVisible).toBe(true)
    expect(obsoleteBench.chatWidthPx).toBe(640)
    expect(obsoleteBench.workspaceWidthPx).toBe(680)
  })

  test("keeps a docked empty Bench on the remembered chat width", () => {
    const atWide = dockedChat({
      requestedBenchWidthPx: 800,
      rememberedDockedChatWidthPx: 640,
    })
    const grown = dockedChat({
      viewport: GROWN_VIEWPORT,
      requestedBenchWidthPx: 800,
      rememberedDockedChatWidthPx: 640,
    })
    const saved = draggedChat({
      profile: BENCH_LAYOUT_PROFILE_DOCUMENT,
      layout: "collection",
      rawWorkspaceWidthPx: 600,
      workspaceMinWidthPx: atWide.minWidthPx,
      workspaceMaxWidthPx: atWide.maxWidthPx,
      leftSidebarVisible: false,
      hasVisibleBenchTarget: false,
    })
    const reopened = dockedChat({
      target: RESOURCE_TARGET,
      requestedBenchWidthPx: 600,
      rememberedDockedChatWidthPx: saved,
    })

    expect(atWide.chatWidthPx).toBe(640)
    expect(atWide.workspaceWidthPx).toBe(800)
    expect(grown.chatWidthPx).toBe(640)
    expect(grown.workspaceWidthPx).toBe(960)
    expect(saved).toBe(840)
    expect(reopened.chatWidthPx).toBe(840)
    expect(reopened.workspaceWidthPx).toBe(600)
  })
})

describe("docked chat width preference", () => {
  beforeEach(() => {
    localStorage.clear()
    useUiPreferences.setState({ dockedChatWidth: null })
  })

  test("remembers the dragged width on this device and ignores a width that is not a positive number", async () => {
    useUiPreferences.getState().setDockedChatWidth(640)
    useUiPreferences.getState().setChatLeftSidebarWidth(300)

    expect(useUiPreferences.getState().dockedChatWidth).toBe(640)
    expect(
      parsePersistedStoreState(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)),
    ).toMatchObject({
      dockedChatWidth: 640,
    })

    const saved = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    useUiPreferences.setState({ dockedChatWidth: null })
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, saved ?? "")
    await useUiPreferences.persist.rehydrate()

    expect(useUiPreferences.getState().dockedChatWidth).toBe(640)

    useUiPreferences.getState().setDockedChatWidth(Number.NaN)
    expect(useUiPreferences.getState().dockedChatWidth).toBe(640)

    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { chatLeftSidebarWidth: 300 },
        version: 23,
      }),
    )
    await useUiPreferences.persist.rehydrate()

    expect(useUiPreferences.getState().dockedChatWidth).toBeNull()
    expect(useUiPreferences.getState().chatLeftSidebarWidth).toBe(300)
  })
})
