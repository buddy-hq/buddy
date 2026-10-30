import { beforeEach, describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_VISUAL,
  resolveBenchLayoutProfile,
  type BenchLayoutProfileID,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "../src/lib/directory-chat/right-workspace-layout"
import {
  resolveChatOwnedDockedShell,
  resolveDraggedDockedChatWidth,
  resolveDraggedWorkspaceWidthRecord,
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
  leftSidebarPreferredOpen: boolean
  workspaceChromeWidthPx?: number
}) {
  return resolveDraggedDockedChatWidth({
    viewport: input.viewport ?? WIDE_VIEWPORT,
    profile: input.profile,
    workspaceChromeWidthPx: input.workspaceChromeWidthPx ?? RIGHT_WORKSPACE_RAIL_WIDTH_PX,
    layout: input.layout,
    leftSidebarPreferredOpen: input.leftSidebarPreferredOpen,
    leftSidebarWidthPx: 280,
    rawWorkspaceWidthPx: input.rawWorkspaceWidthPx,
  })
}

function transientChat(input: {
  requestedBenchWidthPx: number
  rememberedDockedChatWidthPx?: number
}) {
  const shell = resolveChatOwnedDockedShell({
    profile: BENCH_LAYOUT_PROFILE_VISUAL,
    viewport: WIDE_VIEWPORT,
    workspaceChromeWidthPx: 0,
    requestedWorkspaceWidthPx: input.requestedBenchWidthPx,
    rememberedChatWidthPx: input.rememberedDockedChatWidthPx ?? null,
    leftSidebarPreferredOpen: true,
    leftSidebarWidthPx: 280,
  })
  return {
    workspaceWidthPx: shell.workspaceWidthPx,
    minWidthPx: shell.rightWorkspace.workspaceMinWidthPx,
    maxWidthPx: shell.rightWorkspace.workspaceMaxWidthPx,
    chatWidthPx: shell.availableShellWidthPx - shell.workspaceWidthPx,
    sidebarVisible: shell.leftSidebarVisible,
  }
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
      leftSidebarPreferredOpen: true,
    })
    const continued = draggedChat({
      profile: browserProfile,
      layout: "shell",
      rawWorkspaceWidthPx: 900,
      leftSidebarPreferredOpen: true,
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

  test.each([
    { rawWidthPx: 841, sidebarVisible: true, benchWidthPx: 840, chatWidthPx: 320 },
    { rawWidthPx: 863, sidebarVisible: true, benchWidthPx: 840, chatWidthPx: 320 },
    { rawWidthPx: 864, sidebarVisible: false, benchWidthPx: 864, chatWidthPx: 576 },
    { rawWidthPx: 880, sidebarVisible: false, benchWidthPx: 880, chatWidthPx: 560 },
  ])("round-trips a browser drag at $rawWidthPx px", (expected) => {
    const start = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: 700,
      leftSidebarPreferredOpen: true,
    })
    const saved = draggedChat({
      profile: resolveBenchLayoutProfile(BROWSER_TARGET),
      layout: "shell",
      rawWorkspaceWidthPx: expected.rawWidthPx,
      leftSidebarPreferredOpen: true,
    })
    const settled = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: expected.rawWidthPx,
      rememberedDockedChatWidthPx: saved,
      leftSidebarPreferredOpen: true,
    })

    expect(start.maxWidthPx).toBe(840)
    expect(saved).toBe(expected.chatWidthPx)
    expect(settled.sidebarVisible).toBe(expected.sidebarVisible)
    expect(settled.workspaceWidthPx).toBe(expected.benchWidthPx)
    expect(settled.chatWidthPx).toBe(saved)
  })

  test.each([
    { rawWidthPx: 841, sidebarVisible: true, benchWidthPx: 840, chatWidthPx: 320 },
    { rawWidthPx: 863, sidebarVisible: true, benchWidthPx: 840, chatWidthPx: 320 },
    { rawWidthPx: 864, sidebarVisible: false, benchWidthPx: 864, chatWidthPx: 576 },
    { rawWidthPx: 880, sidebarVisible: false, benchWidthPx: 880, chatWidthPx: 560 },
  ])("round-trips a transient drag at $rawWidthPx px", (expected) => {
    const start = transientChat({ requestedBenchWidthPx: 700 })
    const saved = draggedChat({
      profile: BENCH_LAYOUT_PROFILE_VISUAL,
      layout: "shell",
      workspaceChromeWidthPx: 0,
      rawWorkspaceWidthPx: expected.rawWidthPx,
      leftSidebarPreferredOpen: true,
    })
    const settled = transientChat({
      requestedBenchWidthPx: expected.rawWidthPx,
      rememberedDockedChatWidthPx: saved,
    })

    expect(start.maxWidthPx).toBe(840)
    expect(saved).toBe(expected.chatWidthPx)
    expect(settled.sidebarVisible).toBe(expected.sidebarVisible)
    expect(settled.workspaceWidthPx).toBe(expected.benchWidthPx)
    expect(settled.chatWidthPx).toBe(saved)
  })

  test.each([
    { kind: "resource", rawWidthPx: 824, benchWidthPx: 824, chatWidthPx: 616 },
    { kind: "resource", rawWidthPx: 840, benchWidthPx: 840, chatWidthPx: 600 },
    { kind: "resource", rawWidthPx: 1_100, benchWidthPx: 1_051, chatWidthPx: 389 },
    { kind: "empty", rawWidthPx: 824, benchWidthPx: 824, chatWidthPx: 616 },
    { kind: "empty", rawWidthPx: 840, benchWidthPx: 840, chatWidthPx: 600 },
    { kind: "empty", rawWidthPx: 1_100, benchWidthPx: 1_051, chatWidthPx: 389 },
  ])("round-trips a $kind Bench drag at $rawWidthPx px", (expected) => {
    const target = expected.kind === "resource" ? { target: RESOURCE_TARGET } : {}
    const start = dockedChat({
      ...target,
      requestedBenchWidthPx: 700,
      leftSidebarPreferredOpen: true,
    })
    const saved = draggedChat({
      profile: BENCH_LAYOUT_PROFILE_DOCUMENT,
      layout: "collection",
      rawWorkspaceWidthPx: expected.rawWidthPx,
      leftSidebarPreferredOpen: true,
    })
    const settled = dockedChat({
      ...target,
      requestedBenchWidthPx: expected.rawWidthPx,
      rememberedDockedChatWidthPx: saved,
      leftSidebarPreferredOpen: true,
    })

    expect(start.maxWidthPx).toBe(800)
    expect(saved).toBe(expected.chatWidthPx)
    expect(settled.sidebarVisible).toBe(false)
    expect(settled.maxWidthPx).toBe(1_051)
    expect(settled.workspaceWidthPx).toBe(expected.benchWidthPx)
    expect(settled.workspaceWidthPx).toBeGreaterThanOrEqual(start.maxWidthPx)
    expect(settled.chatWidthPx).toBe(saved)
  })

  test.each(["browser", "transient", "resource", "empty"] as const)(
    "restores the preferred sidebar when a %s drag returns below the threshold",
    (kind) => {
      const shellLayout = kind === "browser" || kind === "transient"
      const target =
        kind === "browser"
          ? { target: BROWSER_TARGET }
          : kind === "resource"
            ? { target: RESOURCE_TARGET }
            : {}
      const render = (input: {
        requestedBenchWidthPx: number
        rememberedDockedChatWidthPx?: number
      }) =>
        kind === "transient"
          ? transientChat(input)
          : dockedChat({ ...input, ...target, leftSidebarPreferredOpen: true })
      const drag = (rawWidthPx: number) =>
        draggedChat({
          profile: shellLayout ? BENCH_LAYOUT_PROFILE_VISUAL : BENCH_LAYOUT_PROFILE_DOCUMENT,
          layout: shellLayout ? "shell" : "collection",
          workspaceChromeWidthPx: kind === "transient" ? 0 : RIGHT_WORKSPACE_RAIL_WIDTH_PX,
          rawWorkspaceWidthPx: rawWidthPx,
          leftSidebarPreferredOpen: true,
        })
      const hiddenRawWidthPx = shellLayout ? 880 : 840
      const hidden = render({
        requestedBenchWidthPx: hiddenRawWidthPx,
        rememberedDockedChatWidthPx: drag(hiddenRawWidthPx),
      })
      const restoredRawWidthPx = shellLayout ? 863 : 823
      const saved = drag(restoredRawWidthPx)
      const restored = render({
        requestedBenchWidthPx: restoredRawWidthPx,
        rememberedDockedChatWidthPx: saved,
      })

      expect(hidden.sidebarVisible).toBe(false)
      expect(restored.sidebarVisible).toBe(true)
      expect(restored.workspaceWidthPx).toBe(shellLayout ? 840 : 800)
      expect(restored.chatWidthPx).toBe(shellLayout ? 320 : 360)
      expect(restored.chatWidthPx).toBe(saved)

      for (const rawSize of [0, -40]) {
        const record = resolveDraggedWorkspaceWidthRecord(rawSize)
        const collapsed = render({
          requestedBenchWidthPx: record,
          rememberedDockedChatWidthPx: drag(record),
        })
        expect(record).toBeGreaterThan(0)
        expect(collapsed.sidebarVisible).toBe(true)
      }
    },
  )

  test("clamps remembered chat on the final sidebar shell as the viewport grows", () => {
    const current = dockedChat({
      target: BROWSER_TARGET,
      requestedBenchWidthPx: 700,
      rememberedDockedChatWidthPx: 640,
      leftSidebarPreferredOpen: true,
    })
    const grown = dockedChat({
      target: BROWSER_TARGET,
      viewport: { ...WIDE_VIEWPORT, widthPx: 1_444 },
      requestedBenchWidthPx: 700,
      rememberedDockedChatWidthPx: 640,
      leftSidebarPreferredOpen: true,
    })

    expect(current.sidebarVisible).toBe(true)
    expect(current.chatWidthPx).toBe(636)
    expect(current.workspaceWidthPx).toBe(524)
    expect(grown.sidebarVisible).toBe(true)
    expect(grown.chatWidthPx).toBe(640)
    expect(grown.workspaceWidthPx).toBe(524)
    expect(Math.abs(grown.chatWidthPx - current.chatWidthPx)).toBeLessThanOrEqual(4)
  })

  test.each([
    { viewportWidthPx: 1_440, rememberedChatWidthPx: 640, benchWidthPx: 800 },
    { viewportWidthPx: 1_444, rememberedChatWidthPx: 640, benchWidthPx: 804 },
    { viewportWidthPx: 1_600, rememberedChatWidthPx: 500, benchWidthPx: 1_100 },
  ])("keeps raw overdrag suppression at $viewportWidthPx px", (expected) => {
    const settled = dockedChat({
      target: BROWSER_TARGET,
      viewport: { ...WIDE_VIEWPORT, widthPx: expected.viewportWidthPx },
      requestedBenchWidthPx: 1_200,
      rememberedDockedChatWidthPx: expected.rememberedChatWidthPx,
      leftSidebarPreferredOpen: true,
    })

    expect(settled.sidebarVisible).toBe(false)
    expect(settled.chatWidthPx).toBe(expected.rememberedChatWidthPx)
    expect(settled.workspaceWidthPx).toBe(expected.benchWidthPx)
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
    expect(obsoleteBench.sidebarVisible).toBe(false)
    expect(obsoleteBench.chatWidthPx).toBe(640)
    expect(obsoleteBench.workspaceWidthPx).toBe(960)
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
      leftSidebarPreferredOpen: false,
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
