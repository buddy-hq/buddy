import { describe, expect, test } from "bun:test"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_CODE,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_PRACTICE,
  BENCH_LAYOUT_PROFILE_READING,
  BENCH_LAYOUT_PROFILE_VISUAL,
  BENCH_MODE_REQUEST_POLICY,
  isBenchRoutePathname,
  readBenchOpenPolicyStateFromLocation,
  readBenchTargetFromLocation,
  resolveBenchLayoutDefaults,
  resolveBenchLayoutProfile,
  resolveDockedBenchResizeIntent,
  resolveDockedBenchRightWorkspaceLayout,
  resolveDockedBenchShellLayout,
  resolveBenchOpenPolicy,
  resolveBenchRouteViewTransitionTypes,
  resolveBenchSurfaceDefaults,
  type BenchOpenDecision,
  type BenchOpenPolicyState,
  type BenchOpenRequest,
  type BenchPresentationPreferences,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"
import { resolveRightWorkspaceSelectorDrawerWidth } from "../src/lib/directory-chat/right-sidebar-layout"

const DIRECTORY = "/workspace/buddy"
const RESOURCE_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
const WHITEBOARD_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "current",
} satisfies BenchTarget
const HTML_WIDGET_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "html-widget",
    objectID: "widget-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "runtime",
} satisfies BenchTarget
const QUESTION_SET_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "question-set",
    objectID: "question-set-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "practice",
} satisfies BenchTarget
const FLASHCARD_DECK_OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "flashcard-deck",
    objectID: "flashcard-deck-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "review",
} satisfies BenchTarget

const EMPTY_PREFERENCES = {
  modeBySurface: {},
} satisfies BenchPresentationPreferences
const RIGHT_WORKSPACE_CHROME_WIDTH_PX = 44

function resolveOpenPolicy(input: {
  request: BenchOpenRequest
  current?: BenchOpenPolicyState
  currentVisible?: boolean
  preferences?: BenchPresentationPreferences
  autoOpenSuppressed?: boolean
}): BenchOpenDecision {
  return resolveBenchOpenPolicy({
    request: input.request,
    current: input.current ?? { status: "closed" },
    currentVisible: input.currentVisible ?? (input.current?.status === "open"),
    defaults: resolveBenchSurfaceDefaults(input.request.target),
    preferences: input.preferences ?? EMPTY_PREFERENCES,
    autoOpenSuppressed: input.autoOpenSuppressed ?? false,
  })
}

function openRequest(target: BenchTarget): BenchOpenRequest {
  return {
    directory: DIRECTORY,
    target,
    mode: BENCH_MODE_REQUEST_POLICY,
    autoOpen: null,
  }
}

describe("bench navigation policy", () => {
  test("resolves content-based layout profile defaults", () => {
    const expectedProfiles = [
      {
        profile: BENCH_LAYOUT_PROFILE_READING,
        chatDefault: 520,
        chatMin: 380,
        chatMax: 600,
        surfaceMin: 560,
      },
      {
        profile: BENCH_LAYOUT_PROFILE_DOCUMENT,
        chatDefault: 500,
        chatMin: 380,
        chatMax: 576,
        surfaceMin: 600,
      },
      {
        profile: BENCH_LAYOUT_PROFILE_PRACTICE,
        chatDefault: 500,
        chatMin: 380,
        chatMax: 576,
        surfaceMin: 600,
      },
      {
        profile: BENCH_LAYOUT_PROFILE_CODE,
        chatDefault: 440,
        chatMin: 360,
        chatMax: 504,
        surfaceMin: 720,
      },
      {
        profile: BENCH_LAYOUT_PROFILE_VISUAL,
        chatDefault: 380,
        chatMin: 360,
        chatMax: 432,
        surfaceMin: 780,
      },
    ] as const

    for (const expected of expectedProfiles) {
      expect(
        resolveBenchLayoutDefaults({
          profile: expected.profile,
          viewport: { widthPx: 1_200, heightPx: 900, safeTopPx: 24 },
        }),
      ).toMatchObject({
        dockedChatWidthPx: expected.chatDefault,
        dockedChatMinWidthPx: expected.chatMin,
        dockedChatMaxWidthPx: expected.chatMax,
        benchMinWidthPx: expected.surfaceMin,
        floatingMarginPx: 24,
      })
    }
  })

  test("resolves every profile across representative docked widths", () => {
    const profiles = [
      BENCH_LAYOUT_PROFILE_READING,
      BENCH_LAYOUT_PROFILE_DOCUMENT,
      BENCH_LAYOUT_PROFILE_PRACTICE,
      BENCH_LAYOUT_PROFILE_CODE,
      BENCH_LAYOUT_PROFILE_VISUAL,
    ] as const
    const viewportWidths = [1_024, 1_200, 1_280, 1_440] as const

    for (const profile of profiles) {
      for (const widthPx of viewportWidths) {
        const layout = resolveDockedBenchRightWorkspaceLayout({
          profile,
          viewport: { widthPx, heightPx: 900, safeTopPx: 24 },
          workspaceChromeWidthPx: RIGHT_WORKSPACE_CHROME_WIDTH_PX,
        })

        expect(layout.chatWidthPx).toBeGreaterThanOrEqual(layout.chatMinWidthPx)
        expect(layout.workspaceWidthPx).toBeGreaterThanOrEqual(RIGHT_WORKSPACE_CHROME_WIDTH_PX)
        expect(layout.chatWidthPx + layout.workspaceWidthPx).toBe(widthPx)
        expect(layout.workspaceWidthPx).toBeLessThanOrEqual(layout.workspaceMaxWidthPx)
      }
    }
  })

  test("maps Bench targets to semantic layout profiles", () => {
    expect(resolveBenchLayoutProfile(RESOURCE_OBJECT_TARGET)).toBe(BENCH_LAYOUT_PROFILE_READING)
    expect(
      resolveBenchLayoutProfile({
        type: "workspace-file",
        path: "resources/book.epub",
        viewer: "file",
      }),
    ).toBe(BENCH_LAYOUT_PROFILE_READING)
    expect(
      resolveBenchLayoutProfile({
        type: "workspace-file",
        path: "resources/paper.pdf",
        viewer: "file",
      }),
    ).toBe(BENCH_LAYOUT_PROFILE_READING)
    expect(
      resolveBenchLayoutProfile({
        type: "workspace-file",
        path: "AGENTS.md",
        viewer: "markdown",
      }),
    ).toBe(BENCH_LAYOUT_PROFILE_DOCUMENT)
    expect(
      resolveBenchLayoutProfile({
        type: "workspace-file",
        path: "src/index.ts",
        viewer: "file",
      }),
    ).toBe(BENCH_LAYOUT_PROFILE_CODE)
    expect(
      resolveBenchLayoutProfile({
        type: "workspace-file",
        path: "assets/diagram.svg",
        viewer: "file",
      }),
    ).toBe(BENCH_LAYOUT_PROFILE_VISUAL)
    expect(resolveBenchLayoutProfile(WHITEBOARD_OBJECT_TARGET)).toBe(BENCH_LAYOUT_PROFILE_VISUAL)
    expect(resolveBenchLayoutProfile(QUESTION_SET_OBJECT_TARGET)).toBe(
      BENCH_LAYOUT_PROFILE_PRACTICE,
    )
    expect(resolveBenchLayoutProfile(FLASHCARD_DECK_OBJECT_TARGET)).toBe(
      BENCH_LAYOUT_PROFILE_PRACTICE,
    )
  })

  test("keeps or suppresses the pinned left sidebar without changing its preference", () => {
    const fitting = resolveDockedBenchShellLayout({
      profile: BENCH_LAYOUT_PROFILE_READING,
      viewport: { widthPx: 1_440, heightPx: 900, safeTopPx: 24 },
      workspaceChromeWidthPx: RIGHT_WORKSPACE_CHROME_WIDTH_PX,
      leftSidebarPreferredOpen: true,
      leftSidebarWidthPx: 280,
    })
    expect(fitting.leftSidebarVisible).toBe(true)
    expect(fitting.leftSidebarSuppressed).toBe(false)
    expect(fitting.availableShellWidthPx).toBe(1_160)

    const constrained = resolveDockedBenchShellLayout({
      profile: BENCH_LAYOUT_PROFILE_READING,
      viewport: { widthPx: 1_280, heightPx: 900, safeTopPx: 24 },
      workspaceChromeWidthPx: RIGHT_WORKSPACE_CHROME_WIDTH_PX,
      leftSidebarPreferredOpen: true,
      leftSidebarWidthPx: 280,
    })
    expect(constrained.leftSidebarVisible).toBe(false)
    expect(constrained.leftSidebarSuppressed).toBe(true)
    expect(constrained.availableShellWidthPx).toBe(1_280)
  })

  test("sacrifices the left sidebar before auto-floating after over-drag", () => {
    expect(
      resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: 823,
        maxWorkspaceWidthPx: 800,
        hasVisibleBenchTarget: true,
        leftSidebarVisible: true,
      }),
    ).toBe("clamp")
    expect(
      resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: 824,
        maxWorkspaceWidthPx: 800,
        hasVisibleBenchTarget: true,
        leftSidebarVisible: true,
      }),
    ).toBe("suppress-left-sidebar")
    expect(
      resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: 824,
        maxWorkspaceWidthPx: 800,
        hasVisibleBenchTarget: true,
        leftSidebarVisible: false,
      }),
    ).toBe("float")
    expect(
      resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: 900,
        maxWorkspaceWidthPx: 800,
        hasVisibleBenchTarget: false,
        leftSidebarVisible: false,
      }),
    ).toBe("clamp")
  })

  test("uses drawer-only selector widths and clamps them to workspace content", () => {
    expect(
      resolveRightWorkspaceSelectorDrawerWidth({
        selector: "explorer",
        workspaceWidthPx: 900,
      }),
    ).toBe(360)
    expect(
      resolveRightWorkspaceSelectorDrawerWidth({
        selector: "library",
        workspaceWidthPx: 900,
      }),
    ).toBe(560)
    expect(
      resolveRightWorkspaceSelectorDrawerWidth({
        selector: "explorer",
        workspaceWidthPx: 300,
      }),
    ).toBe(256)
    expect(
      resolveRightWorkspaceSelectorDrawerWidth({
        selector: "library",
        workspaceWidthPx: 300,
      }),
    ).toBe(256)
  })

  test("resolves locked surface defaults", () => {
    expect(resolveBenchSurfaceDefaults(RESOURCE_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      layoutProfile: BENCH_LAYOUT_PROFILE_READING,
    })
    expect(resolveBenchSurfaceDefaults(WHITEBOARD_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_VISUAL,
    })
    expect(resolveBenchSurfaceDefaults(HTML_WIDGET_OBJECT_TARGET)).toEqual({
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_VISUAL,
    })
  })

  test("uses target default mode when entering bench from closed state", () => {
    expect(resolveOpenPolicy({ request: openRequest(WHITEBOARD_OBJECT_TARGET) })).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      layoutProfile: BENCH_LAYOUT_PROFILE_VISUAL,
      policyID: "target-default-mode",
    })
  })

  test("saved surface mode preference wins over target default", () => {
    expect(
      resolveOpenPolicy({
        request: openRequest(WHITEBOARD_OBJECT_TARGET),
        preferences: {
          modeBySurface: {
            whiteboard: BENCH_CHAT_LAYOUT_DOCKED,
          },
        },
      }),
    ).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      policyID: "saved-surface-mode",
    })
  })

  test("policy mode preserves current live mode while bench is already open", () => {
    const currentTarget = {
      type: "workspace-file",
      path: "notes.md",
      viewer: "markdown",
    } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: openRequest({ type: "workspace-file", path: "diagram.png", viewer: "file" }),
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
      }),
    ).toMatchObject({
      action: "open",
      mode: BENCH_CHAT_LAYOUT_FLOATING,
      policyID: "preserved-current-mode",
    })
  })

  test("fullscreen widget auto-open does not replace a different active bench target", () => {
    const currentTarget = {
      type: "workspace-file",
      path: "notes.md",
      viewer: "markdown",
    } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: HTML_WIDGET_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
            eventKey: "message-1:part-1",
          },
        },
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
      }),
    ).toEqual({
      action: "ignore",
      policyID: "auto-open-not-authorized",
    })
  })

  test("whiteboard auto-open replaces a different active bench rail target", () => {
    const currentTarget = {
      type: "workspace-file",
      path: "notes.md",
      viewer: "markdown",
    } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: WHITEBOARD_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: "message-1:part-1",
          },
        },
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
      }),
    ).toMatchObject({
      action: "open",
      target: WHITEBOARD_OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })
  })

  test("auto-open replaces a different bench target parked behind a collapsed workspace", () => {
    const currentTarget = {
      type: "object",
      ref: {
        kind: "html-widget",
        objectID: "widget-1",
        revisionID: null,
        itemID: null,
      },
      viewID: "runtime",
    } satisfies BenchTarget
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: WHITEBOARD_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: "message-1:part-1",
          },
        },
        current: {
          status: "open",
          directory: DIRECTORY,
          target: currentTarget,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          layoutProfile: resolveBenchSurfaceDefaults(currentTarget).layoutProfile,
        },
        currentVisible: false,
      }),
    ).toMatchObject({
      action: "open",
      target: WHITEBOARD_OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      policyID: "preserved-current-mode",
    })
  })

  test("auto-open suppression is resolved by the central open policy", () => {
    expect(
      resolveOpenPolicy({
        request: {
          directory: DIRECTORY,
          target: WHITEBOARD_OBJECT_TARGET,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: {
            policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
            eventKey: "message-1:part-1",
          },
        },
        autoOpenSuppressed: true,
      }),
    ).toEqual({
      action: "ignore",
      policyID: "auto-open-suppressed",
    })
  })

  test("maps route view transitions from committed route states", () => {
    const directoryParam = encodeDirectory(DIRECTORY)
    const markdownPathname = `/${directoryParam}/markdown`
    const filePathname = `/${directoryParam}/file`
    const chatPathname = `/${directoryParam}/chat`

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: chatPathname, search: {} },
        toLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
      }),
    ).toEqual(["bench-route", "bench-open"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: { pathname: chatPathname, search: {} },
      }),
    ).toEqual(["bench-route", "bench-close"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: { pathname: filePathname, search: { path: "diagram.png" } },
      }),
    ).toEqual(["bench-route", "bench-swap"])

    expect(
      resolveBenchRouteViewTransitionTypes({
        pathChanged: false,
        hrefChanged: true,
        fromLocation: { pathname: markdownPathname, search: { path: "notes.md" } },
        toLocation: {
          pathname: markdownPathname,
          search: { path: "notes.md", benchChat: BENCH_CHAT_LAYOUT_FLOATING },
        },
      }),
    ).toBe(false)
  })

  test("reads pathless and explicit bench object routes as the same target", () => {
    const directoryParam = encodeDirectory(DIRECTORY)
    const pathlessPathname = `/${directoryParam}/objects/whiteboard/whiteboard-1`
    const explicitPathname = `/${directoryParam}/_bench/objects/whiteboard/whiteboard-1`
    const search = { view: "current", benchChat: BENCH_CHAT_LAYOUT_FLOATING }

    expect(isBenchRoutePathname(pathlessPathname)).toBe(true)
    expect(isBenchRoutePathname(explicitPathname)).toBe(true)
    expect(readBenchTargetFromLocation({ pathname: pathlessPathname, search })).toEqual(
      WHITEBOARD_OBJECT_TARGET,
    )
    expect(readBenchTargetFromLocation({ pathname: explicitPathname, search })).toEqual(
      WHITEBOARD_OBJECT_TARGET,
    )
    expect(
      readBenchOpenPolicyStateFromLocation({
        directory: DIRECTORY,
        pathname: explicitPathname,
        search,
      }),
    ).toMatchObject({
      status: "open",
      directory: DIRECTORY,
      target: WHITEBOARD_OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_FLOATING,
    })
  })
})
