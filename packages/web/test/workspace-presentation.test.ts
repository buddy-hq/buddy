import { describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_READING,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { resolveWorkspacePresentation } from "../src/lib/directory-chat/workspace-presentation"
import {
  createCollapsedWorkspaceState,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
} from "../src/state/directory-workspace-store"

const TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget

const CLOSED_ROUTE = { status: "closed" } satisfies BenchRouteSnapshot
const WIDE_VIEWPORT = { widthPx: 1_440, heightPx: 900, safeTopPx: 0 }
const NARROW_VIEWPORT = { widthPx: 1_000, heightPx: 800, safeTopPx: 0 }

function resolvePresentation(input: {
  route?: BenchRouteSnapshot
  expanded?: boolean
  drawer?: "search" | "sources" | "practice" | "creations" | "boards" | "files" | null
  hydrated?: boolean
  viewport?: typeof WIDE_VIEWPORT
  requestedWorkspaceWidthPx?: number
  leftSidebarPreferredOpen?: boolean
}) {
  const expanded = input.expanded ?? false
  return resolveWorkspacePresentation({
    projection: effectiveWorkspaceProjection(
      input.route ?? CLOSED_ROUTE,
      {
        docked: expanded
          ? createExpandedWorkspaceState(input.drawer ?? null)
          : createCollapsedWorkspaceState(),
        lastDrawer: input.drawer ?? "sources",
      },
      null,
    ),
    hydrated: input.hydrated ?? true,
    layoutProfile: BENCH_LAYOUT_PROFILE_READING,
    viewport: input.viewport ?? WIDE_VIEWPORT,
    requestedWorkspaceWidthPx: input.requestedWorkspaceWidthPx ?? 700,
    leftSidebarPreferredOpen: input.leftSidebarPreferredOpen ?? true,
    leftSidebarWidthPx: 280,
  })
}

describe("workspace presentation", () => {
  test("renders closed and parked targets like normal chat", () => {
    const closed = resolvePresentation({})
    const parked = resolvePresentation({
      route: {
        status: "open",
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
    })

    expect(closed).toMatchObject({
      kind: "chat",
      benchVisible: false,
      workspaceOpen: false,
      leftSidebar: { visible: true, overlayEnabled: false },
      controls: {
        showThreadBrowserInTitlebar: false,
        showThreadBrowserInPane: false,
        showSidebarThreadControls: false,
        showFloatChat: false,
      },
    })
    expect(parked).toMatchObject({
      kind: "parked-bench",
      benchVisible: false,
      workspaceOpen: false,
      leftSidebar: { visible: true, overlayEnabled: false },
      controls: {
        showThreadBrowserInTitlebar: false,
        showThreadBrowserInPane: false,
        showSidebarThreadControls: false,
        showFloatChat: false,
      },
    })
  })

  test("fills the workspace with a targetless selector without suppressing the sidebar", () => {
    const presentation = resolvePresentation({
      expanded: true,
      drawer: "sources",
      viewport: NARROW_VIEWPORT,
      requestedWorkspaceWidthPx: 900,
    })

    expect(presentation).toMatchObject({
      kind: "selector",
      workspaceOpen: true,
      selector: "sources",
      leftSidebar: { visible: true, overlayEnabled: false },
    })
    expect(presentation.workspace.widthPx).toBe(presentation.workspace.maxWidthPx)
  })

  test("shows docked controls and suppresses the sidebar only when the visible Bench needs space", () => {
    const route = {
      status: "open",
      target: TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    } satisfies BenchRouteSnapshot
    const wide = resolvePresentation({ route, expanded: true })
    const narrow = resolvePresentation({ route, expanded: true, viewport: NARROW_VIEWPORT })

    expect(wide).toMatchObject({
      kind: "docked-bench",
      benchVisible: true,
      dockedBenchVisible: true,
      workspaceOpen: true,
      leftSidebar: { visible: true, overlayEnabled: false },
      controls: {
        showThreadBrowserInTitlebar: false,
        showSidebarThreadControls: true,
        showFloatChat: true,
      },
    })
    expect(narrow).toMatchObject({
      kind: "docked-bench",
      leftSidebar: { visible: false, overlayEnabled: true },
      controls: {
        showThreadBrowserInTitlebar: true,
        showSidebarThreadControls: false,
        showFloatChat: true,
      },
    })
  })

  test("clamps the effective docked width without requiring the requested width to be clamped", () => {
    const requestedWorkspaceWidthPx = 10_000
    const presentation = resolvePresentation({
      route: {
        status: "open",
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      expanded: true,
      requestedWorkspaceWidthPx,
    })

    expect(presentation.workspace.widthPx).toBe(presentation.workspace.maxWidthPx)
    expect(presentation.workspace.widthPx).toBeLessThan(requestedWorkspaceWidthPx)
  })

  test("uses the full canvas for floating Bench and hides controls while hydration is pending", () => {
    const floating = resolvePresentation({
      route: {
        status: "open",
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_FLOATING,
      },
      expanded: true,
    })
    const hydrating = resolvePresentation({
      route: {
        status: "open",
        target: TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      expanded: true,
      hydrated: false,
    })

    expect(floating).toMatchObject({
      kind: "floating-bench",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      benchVisible: true,
      workspaceOpen: true,
      leftSidebar: { visible: false, overlayEnabled: false },
      controls: {
        showThreadBrowserInPane: true,
        showFloatChat: false,
      },
    })
    expect(hydrating).toMatchObject({
      kind: "hydrating",
      benchVisible: false,
      workspaceOpen: false,
      leftSidebar: { visible: true, overlayEnabled: false },
      controls: {
        showThreadBrowserInTitlebar: false,
        showThreadBrowserInPane: false,
        showSidebarThreadControls: false,
        showFloatChat: false,
      },
    })
  })
})
